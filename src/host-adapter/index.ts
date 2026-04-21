// Stub HostAdapter — exposes the contract surface but every method throws
// NotImplemented until the wire-up tasks land (see README.md in this folder
// for the落地依赖 table).

import type {
  HostAdapter,
  Session,
  SessionSpec,
} from './contract/v1/host-adapter.js'
import { CONTRACT_VERSION } from './contract/v1/index.js'

class NotImplementedError extends Error {
  constructor(hook: string) {
    super(
      `host-adapter: ${hook} not yet wired to claude2 internals (see src/host-adapter/README.md)`,
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
