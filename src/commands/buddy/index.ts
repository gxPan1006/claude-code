// Local stub for the /buddy slash command. The published source snapshot keeps
// src/buddy/ (runtime/UI pieces) but omits src/commands/buddy/, so commands.ts's
// `require('./commands/buddy/index.js')` fails whenever feature('BUDDY') is true.
// This stub wires enough behavior for the BUDDY path to load and for the user
// to adopt / pet / rename / mute a companion from the REPL.
import type { Command } from '../../commands.js'
import { feature } from 'bun:bundle'

// `feature()` must appear directly inside an if/ternary per Bun's macro rule,
// so we hoist the check to an initializer rather than a lambda body.
const BUDDY_ENABLED = feature('BUDDY') ? true : false

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Adopt, pet, rename, or mute your companion',
  argumentHint: '[pet|name <new>|mute|unmute|release]',
  isEnabled: () => BUDDY_ENABLED,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
