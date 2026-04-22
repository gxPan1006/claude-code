// Host-adapter auth surface implementation.
//
// Wraps claude2's OAuth + keychain layer so ai-cognit's sidecar can:
//   - detect current logged-in user (keychain read via getClaudeAIOAuthTokens)
//   - start a PKCE OAuth flow (OAuthService) without opening a browser itself
//   - cancel an in-flight flow
//   - log out (performLogout)
//
// All persistence goes through claude2's standard macOS Keychain path —
// identical to what `claude login` / `claude logout` do in the CLI.

import type {
  AuthenticatedUser,
  HostAdapterAuth,
  OAuthLoginHandle,
} from '../contract/v1/auth.js'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OAuthService } = require('../../services/oauth/index.js') as {
  OAuthService: new () => {
    startOAuthFlow(
      authURLHandler: (
        manualUrl: string,
        automaticUrl?: string,
      ) => Promise<void>,
      options?: {
        loginWithClaudeAi?: boolean
        skipBrowserOpen?: boolean
      },
    ): Promise<OAuthTokensLike>
    cleanup(): void
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { installOAuthTokens } = require('../../cli/handlers/auth.js') as {
  installOAuthTokens(tokens: OAuthTokensLike): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const authUtils = require('../../utils/auth.js') as {
  getClaudeAIOAuthTokens(): OAuthTokensLike | null
  getOauthAccountInfo(): AccountInfoLike | undefined
  getSubscriptionType(): string | null
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { performLogout } = require('../../commands/logout/logout.js') as {
  performLogout(opts: { clearOnboarding: boolean }): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enableConfigs } = require('../../utils/config.js') as {
  enableConfigs(): void
}

// Minimal structural types for claude2 internals (avoid importing types.ts
// which doesn't exist as a standalone file in all build configurations).
interface OAuthTokensLike {
  accessToken: string
  subscriptionType: string | null
  profile?: {
    account?: { uuid?: string; email?: string }
  }
  tokenAccount?: {
    uuid?: string
    emailAddress?: string
    organizationUuid?: string
  }
}

interface AccountInfoLike {
  accountUuid: string
  emailAddress: string
}

// ─── Module-level state ───────────────────────────────────────────────────────

let initialized = false

interface PendingLogin {
  svc: InstanceType<typeof OAuthService>
  reject: (err: Error) => void
}

let pending: PendingLogin | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function doInitialize(): Promise<void> {
  if (initialized) return
  enableConfigs()
  initialized = true
}

function buildUser(
  tokens: OAuthTokensLike,
  accountInfo: AccountInfoLike | undefined,
): AuthenticatedUser | null {
  // Prefer account info from the global config (most reliable after login)
  if (accountInfo?.accountUuid && accountInfo?.emailAddress) {
    return {
      email: accountInfo.emailAddress,
      subscriptionType: tokens.subscriptionType ?? null,
      accountUuid: accountInfo.accountUuid,
    }
  }

  // Fallback: data carried in the token itself (available right after OAuth)
  const email =
    tokens.profile?.account?.email ?? tokens.tokenAccount?.emailAddress
  const uuid =
    tokens.profile?.account?.uuid ?? tokens.tokenAccount?.uuid

  if (!email || !uuid) return null

  return {
    email,
    subscriptionType: tokens.subscriptionType ?? null,
    accountUuid: uuid,
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  await doInitialize()
}

async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  await doInitialize()

  const tokens = authUtils.getClaudeAIOAuthTokens()
  if (!tokens) return null

  const accountInfo = authUtils.getOauthAccountInfo()
  return buildUser(tokens, accountInfo)
}

async function startOAuthLogin(): Promise<OAuthLoginHandle> {
  await doInitialize()

  if (pending) {
    throw new Error('another OAuth login is already in progress')
  }

  const svc = new OAuthService()

  // We need to surface the URLs before the flow completes (and before
  // startOAuthFlow resolves). OAuthService calls authURLHandler inside
  // waitForAuthorization via `void onReady()` — i.e. fire-and-forget but
  // invoked immediately once the loopback server is listening.
  //
  // Strategy: expose a "gotUrls" promise that resolves the moment our
  // authURLHandler is called. startOAuthLogin awaits it so it can return
  // the handle synchronously to the caller while the OAuth flow continues
  // in the background.
  let resolveGotUrls!: (urls: { manual: string; automatic: string }) => void
  let rejectGotUrls!: (err: Error) => void
  const gotUrls = new Promise<{ manual: string; automatic: string }>(
    (res, rej) => {
      resolveGotUrls = res
      rejectGotUrls = rej
    },
  )

  // "completed" resolves after tokens are received AND persisted.
  let resolveCompleted!: (user: AuthenticatedUser) => void
  let rejectCompleted!: (err: Error) => void
  const completed = new Promise<AuthenticatedUser>((res, rej) => {
    resolveCompleted = res
    rejectCompleted = rej
  })

  // Track pending so cancelOAuthLogin can abort.
  pending = { svc, reject: rejectCompleted }

  // Start the OAuth flow in the background. We deliberately do NOT await
  // this here; it resolves only after the browser completes the redirect.
  svc
    .startOAuthFlow(
      async (manualUrl: string, automaticUrl?: string) => {
        resolveGotUrls({ manual: manualUrl, automatic: automaticUrl ?? manualUrl })
        // authURLHandler must not return until the flow is over (or cancelled),
        // because OAuthService awaits it before proceeding. We wait on
        // "completed" (or its rejection) so the flow can continue in parallel.
        await completed.catch(() => {/* swallow cancel/errors here — flow has exited */})
      },
      { skipBrowserOpen: true, loginWithClaudeAi: true },
    )
    .then(async (tokens: OAuthTokensLike) => {
      pending = null
      // Persist tokens to keychain (equivalent to `claude login`).
      await installOAuthTokens(tokens)
      // Re-read account info from config (installOAuthTokens populates it).
      const accountInfo = authUtils.getOauthAccountInfo()
      const user = buildUser(tokens, accountInfo)
      if (user) {
        resolveCompleted(user)
      } else {
        rejectCompleted(
          new Error('OAuth succeeded but could not resolve user identity'),
        )
      }
    })
    .catch((err: unknown) => {
      pending = null
      const e = err instanceof Error ? err : new Error(String(err))
      // gotUrls may not have resolved yet if the flow errored before URLs were generated.
      rejectGotUrls(e)
      rejectCompleted(e)
    })

  // Wait for the auth URLs to be available before returning the handle.
  // This ensures the caller always gets real URLs in the handle.
  const { manual, automatic } = await gotUrls

  return {
    manualUrl: manual,
    automaticUrl: automatic,
    completed,
  }
}

function cancelOAuthLogin(): void {
  if (!pending) return
  const { svc, reject } = pending
  pending = null
  svc.cleanup()
  reject(new Error('OAuth login cancelled'))
}

async function logout(): Promise<void> {
  await doInitialize()
  await performLogout({ clearOnboarding: false })
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildHostAdapterAuth(): HostAdapterAuth {
  return {
    initialize,
    getCurrentUser,
    startOAuthLogin,
    cancelOAuthLogin,
    logout,
  }
}
