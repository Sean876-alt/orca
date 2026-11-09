import React from 'react'
import { AlertTriangle, Bot, Loader2, Pencil, RotateCcw, SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { resolveVmEnvironmentCheckDecision } from '@/lib/ephemeral-vm-environment-check-decision'
import type { PendingWorktreeCreation } from '@/lib/workspace/creation/pending-worktree-creation'
import { toast } from 'sonner'
import type { EnvironmentSetupFailureContext } from '../../../../shared/environment-setup-agent-prompt'
import {
  formatEnvironmentDoctorChecks,
  type EnvironmentDoctorCheck
} from '../../../../shared/environment-doctor-types'
import { StepIcon } from './WorktreeSetupSteps'
import type { WorktreeSetupStepState } from './worktree-setup-steps'
import { VmBuildLog } from './VmBuildLog'

type VmBuildStep = { id: 'provision' | 'checks' | 'create'; state: WorktreeSetupStepState }

/** Provision, then the VM's environment checks, then the workspace; a failed step keeps the steps before it done. */
export function deriveVmBuildSteps(
  entry: Pick<PendingWorktreeCreation, 'status' | 'environmentCheck'>
): VmBuildStep[] {
  const check = entry.environmentCheck?.status
  const failed = entry.status === 'error'
  return [
    { id: 'provision', state: check ? 'done' : failed ? 'failed' : 'running' },
    {
      id: 'checks',
      state: !check
        ? 'pending'
        : check === 'running'
          ? 'running'
          : check === 'failed'
            ? 'failed'
            : 'done'
    },
    { id: 'create', state: 'pending' }
  ]
}

// Lazy: the agent-launch graph is heavy and only needed once the user asks for it.
function startFixWithAgent(args: {
  repoId: string
  recipeId: string
  failure: EnvironmentSetupFailureContext
}): void {
  void import('@/lib/environment-setup-agent-launch')
    .then(({ launchEnvironmentSetupAgent }) => launchEnvironmentSetupAgent(args))
    .catch((launchError: unknown) => {
      toast.error(launchError instanceof Error ? launchError.message : String(launchError))
    })
}

function stepLabel(step: VmBuildStep, t: Translate): string {
  switch (step.id) {
    case 'provision':
      return t('auto.components.worktree.creation.VmBuildSheet.provision', 'Provision VM')
    case 'checks':
      return t('auto.components.worktree.creation.VmBuildSheet.checks', 'Check environment')
    case 'create':
      return t('auto.components.worktree.creation.VmBuildSheet.create', 'Create workspace')
  }
}

/** The VM create sheet: a named-phase checklist, a failure card with recovery actions, and the recipe log. */
export function VmBuildSheet({
  creationId,
  entry,
  elapsedLabel,
  error,
  onCancel,
  onRetry,
  onDismiss,
  onEditRecipe
}: {
  creationId: string
  entry: PendingWorktreeCreation
  elapsedLabel: string
  error: string | null
  onCancel: () => void
  onRetry: () => void
  onDismiss: () => void
  onEditRecipe: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const steps = deriveVmBuildSteps(entry)
  const checkStatus = entry.environmentCheck?.status
  const checksFailed = checkStatus === 'failed'
  const recipe = entry.request.ephemeralVmRecipe
  const problems = (entry.environmentCheck?.checks ?? []).filter((check) => check.status !== 'pass')

  const fixWithAgent = (): void => {
    if (!recipe) {
      return
    }
    startFixWithAgent({
      repoId: recipe.sourceRepoId,
      recipeId: recipe.recipeId,
      failure: checksFailed
        ? {
            step: stepLabel(steps[1], t),
            error: problems
              .filter((check) => check.status === 'fail')
              .map((check) => check.message)
              .join(' '),
            log: formatEnvironmentDoctorChecks(problems).join('\n')
          }
        : {
            step: stepLabel(steps[0], t),
            error: error ?? '',
            log: entry.provisioningLog
          }
    })
  }

  return (
    <div className="flex min-h-full justify-center pt-12">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {error === null && !checksFailed ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
            )}
            <span>
              {t('auto.components.worktree.creation.VmBuildSheet.title', 'Building your VM')}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{elapsedLabel}</span>
          </div>
          {error === null && !checksFailed ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t(
                'auto.components.worktree.creation.WorktreeCreationPanel.cancelProvisioning',
                'Cancel'
              )}
            </button>
          ) : null}
        </div>

        <ol className="flex flex-col rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2 py-1">
              <StepIcon state={step.state} />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  step.state === 'pending' && 'text-muted-foreground',
                  step.state === 'failed' && 'text-destructive'
                )}
              >
                {stepLabel(step, t)}
              </span>
            </li>
          ))}
        </ol>

        {checksFailed || error !== null ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-3">
            <div className="text-sm font-medium text-destructive">
              {checksFailed
                ? t(
                    'auto.components.worktree.creation.VmBuildSheet.checksFailed',
                    'The VM is up, but its environment checks failed'
                  )
                : t(
                    'auto.components.worktree.creation.WorktreeCreationPanel.ed2a664f8b',
                    'Couldn’t create worktree'
                  )}
            </div>
            {checksFailed ? (
              <ul className="flex flex-col gap-1.5">
                {problems.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            ) : (
              <p className="break-words text-xs text-muted-foreground">{error}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="xs" onClick={fixWithAgent} disabled={!recipe}>
                <Bot />
                {t('auto.components.worktree.creation.VmBuildSheet.fixWithAgent', 'Fix with agent')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={
                  checksFailed
                    ? () => resolveVmEnvironmentCheckDecision(creationId, 'retry')
                    : onRetry
                }
              >
                <RotateCcw />
                {checksFailed
                  ? t('auto.components.worktree.creation.VmBuildSheet.retryChecks', 'Retry checks')
                  : t(
                      'auto.components.worktree.creation.WorktreeCreationPanel.34dd5ee38b',
                      'Retry'
                    )}
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={onEditRecipe}>
                <Pencil />
                {t('auto.components.worktree.creation.VmBuildSheet.editRecipe', 'Edit recipe')}
              </Button>
              {checksFailed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => resolveVmEnvironmentCheckDecision(creationId, 'open-anyway')}
                >
                  <SquareArrowOutUpRight />
                  {t('auto.components.worktree.creation.VmBuildSheet.openAnyway', 'Open anyway')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
                {t('auto.components.worktree.creation.WorktreeCreationPanel.dabd226118', 'Dismiss')}
              </Button>
            </div>
            {checksFailed ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'auto.components.worktree.creation.VmBuildSheet.openAnywayHint',
                  'Open anyway keeps this VM and creates the workspace on it as is. Dismiss destroys the VM.'
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        <VmBuildLog
          log={entry.provisioningLog ?? ''}
          emptyLabel={t(
            'auto.components.worktree.creation.WorktreeCreationPanel.vmProvisioningLogEmpty',
            'Waiting for recipe output…'
          )}
        />
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: EnvironmentDoctorCheck }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-px w-9 shrink-0 font-mono text-[10px] font-semibold uppercase',
            check.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {check.status}
        </span>
        <span className="min-w-0 break-words text-foreground">{check.message}</span>
      </div>
      {check.remediation ? (
        <p className="ml-11 whitespace-pre-wrap break-words text-muted-foreground">
          {check.remediation}
        </p>
      ) : null}
    </li>
  )
}
