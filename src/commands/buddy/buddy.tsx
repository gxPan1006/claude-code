// Minimal /buddy implementation, wired into the local source snapshot.
//
// Subcommands:
//   /buddy                -> adopt a companion if none, or show current info
//   /buddy pet            -> trigger the heart-burst animation in CompanionSprite
//   /buddy name <new>     -> rename
//   /buddy mute|unmute    -> hide/show the sprite without releasing the companion
//   /buddy release        -> delete the stored companion (bones regen from userId next adopt)
//
// Rendering: this command is local-jsx, so it returns a ReactNode. We render a
// small confirmation via Text, then call onDone() so the REPL closes the overlay.
import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getCompanion } from '../../buddy/companion.js'
import { useSetAppState } from '../../state/AppState.js'
import type { StoredCompanion } from '../../buddy/types.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

// Tiny helper component — dispatches companionPetAt into AppState on mount
// (the LocalJSXCommandCall body runs outside render so can't use hooks itself).
function PetDispatcher({ at }: { at: number }): null {
  const setAppState = useSetAppState()
  React.useEffect(() => {
    setAppState(prev => ({ ...prev, companionPetAt: at }))
  }, [setAppState, at])
  return null
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Text>
      <Text dimColor>{label}: </Text>
      <Text>{value}</Text>
    </Text>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const trimmed = (args ?? '').trim()
  const [subRaw, ...rest] = trimmed.split(/\s+/)
  const sub = subRaw?.toLowerCase() ?? ''

  // Helper: persist a StoredCompanion (or clear it).
  const setStored = (next: StoredCompanion | undefined) => {
    saveGlobalConfig(cfg => ({ ...cfg, companion: next }))
  }

  const now = Date.now()
  const existing = getGlobalConfig().companion
  const hydrated = getCompanion()

  // --- release -----------------------------------------------------------
  if (sub === 'release') {
    setStored(undefined)
    onDone('Companion released.', { display: 'system' })
    return <Text>👋 released</Text>
  }

  // --- mute / unmute -----------------------------------------------------
  if (sub === 'mute' || sub === 'unmute') {
    const muted = sub === 'mute'
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: muted }))
    onDone(muted ? 'Companion muted.' : 'Companion unmuted.', {
      display: 'system',
    })
    return <Text>{muted ? '🔇 muted' : '🔊 unmuted'}</Text>
  }

  // --- name <new> --------------------------------------------------------
  if (sub === 'name') {
    const newName = rest.join(' ').trim()
    if (!newName) {
      onDone('Usage: /buddy name <new-name>', { display: 'system' })
      return <Text color="yellow">need a name</Text>
    }
    if (!existing) {
      onDone('No companion yet. Run /buddy to adopt one first.', {
        display: 'system',
      })
      return <Text color="yellow">no companion</Text>
    }
    setStored({ ...existing, name: newName })
    onDone(`Renamed to ${newName}.`, { display: 'system' })
    return <Text>✏️  renamed to {newName}</Text>
  }

  // --- pet ---------------------------------------------------------------
  if (sub === 'pet') {
    if (!existing) {
      onDone('No companion to pet. Run /buddy to adopt one first.', {
        display: 'system',
      })
      return <Text color="yellow">no companion</Text>
    }
    // CompanionSprite watches AppState.companionPetAt. The hook can't be
    // called from this async body, so a tiny child component dispatches it
    // on mount via useEffect.
    onDone('You pet the companion.', { display: 'system' })
    return (
      <>
        <PetDispatcher at={now} />
        <Text>♥ pet</Text>
      </>
    )
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
    const freshly = getCompanion()
    onDone(`Adopted ${defaultSoul.name}!`, { display: 'system' })
    return (
      <Box flexDirection="column">
        <Text bold>🥚 hatched!</Text>
        <InfoLine label="name" value={freshly?.name ?? defaultSoul.name} />
        <InfoLine
          label="species"
          value={freshly?.species ?? '(regen on next read)'}
        />
        <InfoLine label="rarity" value={freshly?.rarity ?? '?'} />
        <Text dimColor>
          Try: /buddy pet · /buddy name &lt;new&gt; · /buddy mute
        </Text>
      </Box>
    )
  }

  // Info view — hydrated has bones + soul merged.
  onDone(undefined, { display: 'skip' })
  return (
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
    </Box>
  )
}
