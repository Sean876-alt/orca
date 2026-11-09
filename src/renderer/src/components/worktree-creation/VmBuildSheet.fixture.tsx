import { defineFixture } from '../../component-fixtures/component-fixture'
import type { PendingWorktreeCreation } from '@/lib/workspace/creation/pending-worktree-creation'
import { VmBuildSheet } from './VmBuildSheet'

const LOG = [
  'Creating sandbox from snapshot snap_7f2c…',
  'Sandbox ready: sbx_41d9 (us-east-1)',
  'Cloning repository…',
  'Starting orca serve on :7420',
  'Pairing code emitted.'
].join('\n')

function entry(patch: Partial<PendingWorktreeCreation>): PendingWorktreeCreation {
  return {
    creationId: 'fixture',
    phase: 'provisioning-vm',
    status: 'creating',
    startedAt: 0,
    indeterminate: false,
    loaderVisible: true,
    provisioningLog: LOG,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the sheet reads only name and ephemeralVmRecipe from the request.
    request: {
      name: 'fix-login',
      ephemeralVmRecipe: { sourceRepoId: 'repo', recipeId: 'sandbox', projectId: 'p' }
    } as PendingWorktreeCreation['request'],
    ...patch
  }
}

function frame(value: PendingWorktreeCreation, error: string | null = null) {
  return defineFixture({
    width: 760,
    render: () => (
      <div className="bg-background p-3">
        <VmBuildSheet
          creationId="fixture"
          entry={value}
          elapsedLabel="1:42"
          error={error}
          onCancel={() => {}}
          onRetry={() => {}}
          onDismiss={() => {}}
          onEditRecipe={() => {}}
        />
      </div>
    )
  })
}

export const provisioning = frame(
  entry({ provisioningLog: LOG.split('\n').slice(0, 2).join('\n') })
)

export const checking = frame(entry({ environmentCheck: { status: 'running' } }))

export const checksFailed = frame(
  entry({
    environmentCheck: {
      status: 'failed',
      checks: [
        { id: 'tool.git', category: 'tools', status: 'pass', message: 'git is installed.' },
        {
          id: 'tool.pnpm',
          category: 'tools',
          status: 'fail',
          message: 'pnpm is not on PATH, but package.json needs it.',
          remediation: 'Install pnpm in the environment image or setup script.'
        },
        {
          id: 'agent.claude',
          category: 'agents',
          status: 'warn',
          message: 'Claude is installed but not signed in.',
          remediation: 'Run `claude auth login` in this environment.'
        },
        {
          id: 'git.push',
          category: 'git',
          status: 'fail',
          message: 'A dry-run push to "origin" was refused.',
          remediation:
            'Give this environment a Git credential with write access to the repo.\nremote: Permission to acme/web.git denied.'
        }
      ]
    }
  })
)

export const provisionFailed = frame(
  entry({ status: 'error', provisioningLog: `${LOG}\nError: snapshot snap_7f2c not found` }),
  'Recipe exited with code 1.'
)
