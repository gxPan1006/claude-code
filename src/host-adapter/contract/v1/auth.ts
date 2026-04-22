// Host-side auth surface exposed to external backends (e.g. ai-cognit).
// Wraps claude2's OAuth + API-key discovery so a caller can:
//   - check if a user is already logged in (keychain detection)
//   - kick off a browser OAuth flow (Claude subscription / Pro / Max)
//   - log out (clear tokens)
// Token persistence is claude2's standard macOS Keychain flow — NOT a
// separate store — so logging in through this surface is equivalent to
// running `claude login` on the terminal.

export interface AuthenticatedUser {
  /** Email address on the logged-in Anthropic account. */
  email: string
  /**
   * Subscription tier. Values observed: 'pro', 'max', 'team',
   * 'team_premium', 'enterprise', 'free', or null for tokens that don't
   * carry profile info (e.g. bare API keys).
   */
  subscriptionType: string | null
  /** Opaque UUID for the account, useful for diagnostics. */
  accountUuid: string
}

/** Opaque handle returned by startOAuthLogin so callers can await completion. */
export interface OAuthLoginHandle {
  /** URL the user pastes if automatic-redirect flow fails (fallback). */
  manualUrl: string
  /** URL the user's browser should visit for the automatic (loopback) flow. */
  automaticUrl: string
  /**
   * Resolves once tokens have been received AND persisted via claude2's
   * installOAuthTokens (keychain shared with the `claude` CLI). Rejects on
   * cancel or flow failure.
   */
  completed: Promise<AuthenticatedUser>
}

export interface HostAdapterAuth {
  /**
   * Bootstrap claude2's config/auth layer so keychain queries work. Safe
   * to call multiple times (idempotent). MUST be called before any other
   * auth method.
   */
  initialize(): Promise<void>

  /**
   * Returns the currently logged-in Anthropic account (from claude2's
   * keychain), or null if no valid OAuth tokens. Does not touch API-key
   * flows.
   */
  getCurrentUser(): Promise<AuthenticatedUser | null>

  /**
   * Start a Claude.ai OAuth login (PKCE). Opens NO browser itself — the
   * caller is expected to navigate its own WebView / browser to
   * `automaticUrl` so claude2's internal loopback listener can capture
   * the redirect. On success the tokens are persisted to claude2's
   * keychain via installOAuthTokens, and `completed` resolves with the
   * new user.
   *
   * Only one login flow can be in progress at a time — a second call
   * while one is pending will reject.
   */
  startOAuthLogin(): Promise<OAuthLoginHandle>

  /**
   * Abort the in-flight OAuth flow (if any). Resolved promises/returned
   * handles are rejected. No-op if nothing pending.
   */
  cancelOAuthLogin(): void

  /**
   * Clear stored OAuth tokens + account info (keychain + config). The
   * caller should also clear its own credentials cache.
   */
  logout(): Promise<void>
}
