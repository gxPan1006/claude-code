// HostAdapter entry. Checkpoint 1 ships the pure translation layer
// (internal/); createSession stays a NotImplementedError stub until the
// Checkpoint 2 QueryEngine wire-up lands. See README.md §Checkpoint 2.
//
// Early consumers (ai-cognit integration tests, simulators) can reach the
// translators directly via `import { internal } from './host-adapter'`.

import type {
  HostAdapter,
  Session,
  SessionSpec,
} from './contract/v1/host-adapter.js'
import { CONTRACT_VERSION } from './contract/v1/index.js'

export * as internal from './internal/barrel.js'

class NotImplementedError extends Error {
  constructor(hook: string) {
    super(
      `host-adapter: ${hook} not yet wired to claude2 internals (see src/host-adapter/README.md §Checkpoint 2)`,
    )
    this.name = 'NotImplementedError'
  }
}

export const hostAdapter: HostAdapter = {
  contractVersion: CONTRACT_VERSION,
  async createSession(_spec: SessionSpec): Promise<Session> {
    throw new NotImplementedError('createSession')
  },
}

export default hostAdapter
export * from './contract/v1/index.js'
