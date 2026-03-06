import type { ProcessAdapter, ChildProcessHandle, SpawnOptions } from '@april/core'

export const processAdapter: ProcessAdapter = {
  spawn(_command: string, _args: string[], _options: SpawnOptions): ChildProcessHandle {
    throw new Error('Process spawning is not supported on mobile')
  }
}
