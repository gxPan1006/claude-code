// Minimal /buddy implementation, wired into the local source snapshot.
//
// Subcommands:
//   /buddy                -> adopt a companion if none, or show current info
//   /buddy pet            -> trigger the heart-burst animation in CompanionSprite
//   /buddy name <new>     -> rename
//   /buddy mute|unmute    -> hide/show the sprite without releasing the companion
//   /buddy release        -> delete the stored companion (bones regen on next adopt)
//
// Rendering convention (see src/commands/plan/plan.tsx): build the JSX, run
// renderToString() to materialize it into terminal-ready output, pass that
// string to onDone(). Returning JSX from the async call() body doesn't show up
// in the REPL — only the onDone argument does.
import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getCompanion } from '../../buddy/companion.js'
import type { StoredCompanion } from '../../buddy/types.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { renderToString } from '../../utils/staticRender.js'

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Text>
      <Text dimColor>{label}: </Text>
      <Text>{value}</Text>
    </Text>
  )
}

async function emit(
  onDone: Parameters<LocalJSXCommandCall>[0],
  node: React.ReactNode,
  system?: string,
): Promise<React.ReactNode> {
  const out = await renderToString(<>{node}</>)
  onDone(out, system ? { display: 'system' } : undefined)
  return null
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const trimmed = (args ?? '').trim()
  const [subRaw, ...rest] = trimmed.split(/\s+/)
  const sub = subRaw?.toLowerCase() ?? ''

  const setStored = (next: StoredCompanion | undefined) => {
    saveGlobalConfig(cfg => ({ ...cfg, companion: next }))
  }

  const now = Date.now()
  const existing = getGlobalConfig().companion

  // --- release -----------------------------------------------------------
  if (sub === 'release') {
    setStored(undefined)
    return emit(onDone, <Text>👋 companion released.</Text>)
  }

  // --- mute / unmute -----------------------------------------------------
  if (sub === 'mute' || sub === 'unmute') {
    const muted = sub === 'mute'
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: muted }))
    return emit(
      onDone,
      <Text>{muted ? '🔇 muted' : '🔊 unmuted'} companion.</Text>,
    )
  }

  // --- name <new> --------------------------------------------------------
  if (sub === 'name') {
    const newName = rest.join(' ').trim()
    if (!newName) {
      return emit(onDone, <Text color="yellow">Usage: /buddy name &lt;new-name&gt;</Text>)
    }
    if (!existing) {
      return emit(
        onDone,
        <Text color="yellow">No companion yet. Run /buddy to adopt one first.</Text>,
      )
    }
    setStored({ ...existing, name: newName })
    return emit(onDone, <Text>✏️  renamed to {newName}.</Text>)
  }

  // --- pet ---------------------------------------------------------------
  if (sub === 'pet') {
    if (!existing) {
      return emit(
        onDone,
        <Text color="yellow">No companion to pet. Run /buddy to adopt one first.</Text>,
      )
    }
    // CompanionSprite watches AppState.companionPetAt. setAppState is on
    // ToolUseContext (which LocalJSXCommandContext extends).
    context.setAppState(prev => ({ ...prev, companionPetAt: now }))
    return emit(onDone, <Text>♥ you pet the companion.</Text>)
  }

  // --- default: adopt or info -------------------------------------------
  if (!existing) {
    const defaultSoul: StoredCompanion = {
      name: 'Pal',
      personality:
        'A friendly local sidekick. Mostly quiet, occasionally curious.',
      hatchedAt: now,
    }
    setStored(defaultSoul)
    const hydrated = getCompanion()
    return emit(
      onDone,
      <Box flexDirection="column">
        <Text bold>🥚 hatched!</Text>
        <InfoLine label="name" value={hydrated?.name ?? defaultSoul.name} />
        <InfoLine
          label="species"
          value={hydrated?.species ?? '(regen on next read)'}
        />
        <InfoLine label="rarity" value={hydrated?.rarity ?? '?'} />
        <Text dimColor>
          Try: /buddy pet · /buddy name &lt;new&gt; · /buddy mute
        </Text>
      </Box>,
    )
  }

  // Info view — hydrated has bones + soul merged.
  const hydrated = getCompanion()
  return emit(
    onDone,
    <Box flexDirection="column">
      <Text bold>Your companion</Text>
      <InfoLine label="name" value={hydrated?.name ?? existing.name} />
      <InfoLine label="species" value={hydrated?.species ?? '?'} />
      <InfoLine label="rarity" value={hydrated?.rarity ?? '?'} />
      <InfoLine label="hat" value={hydrated?.hat ?? '?'} />
      <InfoLine
        label="hatched"
        value={new Date(existing.hatchedAt).toLocaleString()}
      />
      <Text dimColor>
        /buddy pet · /buddy name &lt;new&gt; · /buddy mute · /buddy release
      </Text>
    </Box>,
  )
}
