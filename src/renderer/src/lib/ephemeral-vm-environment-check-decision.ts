export type VmEnvironmentCheckDecision = 'open-anyway' | 'retry' | 'cancel'

// Dependency-free so the pending-creation store can stop a VM build's checks when the user dismisses it.
const waiting = new Map<string, (decision: VmEnvironmentCheckDecision) => void>()
const running = new Map<string, AbortController>()

/** Pause a VM create on failed environment checks until the user picks what to do. */
export function awaitVmEnvironmentCheckDecision(
  creationId: string
): Promise<VmEnvironmentCheckDecision> {
  waiting.get(creationId)?.('cancel')
  return new Promise((resolve) => {
    waiting.set(creationId, (decision) => {
      waiting.delete(creationId)
      resolve(decision)
    })
  })
}

export function resolveVmEnvironmentCheckDecision(
  creationId: string,
  decision: VmEnvironmentCheckDecision
): void {
  waiting.get(creationId)?.(decision)
}

/** A signal for one in-flight check run; cancelling the build aborts it so the VM is released at once. */
export function beginVmEnvironmentCheckRun(creationId: string): AbortSignal {
  running.get(creationId)?.abort()
  const controller = new AbortController()
  running.set(creationId, controller)
  return controller.signal
}

export function endVmEnvironmentCheckRun(creationId: string, signal: AbortSignal): void {
  if (running.get(creationId)?.signal === signal) {
    running.delete(creationId)
  }
}

/** The user dismissed the build: stop any running check and any pause waiting on them. */
export function cancelVmEnvironmentCheck(creationId: string): void {
  running.get(creationId)?.abort()
  running.delete(creationId)
  resolveVmEnvironmentCheckDecision(creationId, 'cancel')
}
