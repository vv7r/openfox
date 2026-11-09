import type { Translation } from '@shared/i18n/index.js'
import { t } from '../../i18n'
import { addParallelChild, changeStepType, patchParallelChild } from './editing'
import { resolveAgent } from './layout'
import type { AgentRef, ParallelChildStep, StepType, TemplateVariable, WorkflowStep } from './types'
import styles from './Workflows.module.css'

const STEP_TYPES: Array<{ value: StepType; label: Translation }> = [
  { value: 'agent', label: { en: 'Agent', fr: 'Agent' } },
  { value: 'sub_agent', label: { en: 'Sub-agent', fr: 'Sous-agent' } },
  { value: 'shell', label: { en: 'Shell', fr: 'Shell' } },
  { value: 'user', label: { en: 'User (pause)', fr: 'Utilisateur (pause)' } },
  { value: 'parallel', label: { en: 'Parallel', fr: 'Parallèle' } },
]

const DEFAULT_TIMEOUT_MS = 60_000

function Variables({ variables, onInsert }: { variables: TemplateVariable[]; onInsert: (name: string) => void }) {
  if (variables.length === 0) return null
  return (
    <div className={styles.variables}>
      {variables.map((variable) => (
        <button key={variable.name} type="button" title={variable.description} onClick={() => onInsert(variable.name)}>
          {`{{${variable.name}}}`}
        </button>
      ))}
    </div>
  )
}

function TemplatedText({
  label,
  value,
  rows,
  mono = false,
  placeholder,
  variables,
  onChange,
}: {
  label: Translation
  value: string
  rows: number
  mono?: boolean
  placeholder: string
  variables: TemplateVariable[]
  onChange: (value: string) => void
}) {
  return (
    <div className={styles.field}>
      <span>{t(label)}</span>
      <textarea
        rows={rows}
        data-mono={mono || undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <Variables variables={variables} onInsert={(name) => onChange(`${value}{{${name}}}`)} />
    </div>
  )
}

function SubAgentSelect({
  value,
  agents,
  onChange,
}: {
  value: string
  agents: AgentRef[]
  onChange: (id: string) => void
}) {
  return (
    <label className={styles.field}>
      {t({ en: 'Sub-agent type', fr: 'Type de sous-agent' })}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t({ en: 'Select…', fr: 'Sélectionner…' })}</option>
        {agents
          .filter((agent) => agent.subagent)
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
      </select>
    </label>
  )
}

function ShellLimits({
  timeout,
  codes,
  onChange,
}: {
  timeout: number | undefined
  codes: number[] | undefined
  onChange: (patch: { timeout?: number; successExitCodes?: number[] }) => void
}) {
  return (
    <div className={styles.columns}>
      <label className={styles.field}>
        {t({ en: 'Timeout (ms)', fr: 'Délai (ms)' })}
        <input
          type="number"
          data-mono
          value={timeout ?? DEFAULT_TIMEOUT_MS}
          onChange={(event) => onChange({ timeout: Number(event.target.value) })}
        />
      </label>
      <label className={styles.field}>
        {t({ en: 'Success codes', fr: 'Codes de succès' })}
        <input
          data-mono
          value={(codes ?? [0]).join(', ')}
          onChange={(event) =>
            onChange({
              successExitCodes: event.target.value
                .split(',')
                .map((code) => Number(code.trim()))
                .filter((code) => !Number.isNaN(code)),
            })
          }
        />
      </label>
    </div>
  )
}

function ChildEditor({
  child,
  agents,
  variables,
  onPatch,
  onRemove,
}: {
  child: ParallelChildStep
  agents: AgentRef[]
  variables: TemplateVariable[]
  onPatch: (patch: Partial<ParallelChildStep>) => void
  onRemove: () => void
}) {
  return (
    <div className={styles.child}>
      <div className={styles.panelHeader}>
        <input
          data-mono
          value={child.id}
          aria-label={t({ en: 'Child ID', fr: 'ID de l’étape enfant' })}
          onChange={(event) => onPatch({ id: event.target.value })}
        />
        <select
          value={child.type}
          aria-label={t({ en: 'Child type', fr: 'Type de l’étape enfant' })}
          onChange={(event) => onPatch({ type: event.target.value as ParallelChildStep['type'] })}
        >
          <option value="sub_agent">{t({ en: 'Sub-agent', fr: 'Sous-agent' })}</option>
          <option value="shell">{t({ en: 'Shell', fr: 'Shell' })}</option>
        </select>
        <button type="button" className={styles.linkDanger} onClick={onRemove}>
          {t({ en: 'Delete', fr: 'Supprimer' })}
        </button>
      </div>
      {child.type === 'sub_agent' ? (
        <>
          <SubAgentSelect
            value={child.subAgentType ?? ''}
            agents={agents}
            onChange={(subAgentType) => onPatch({ subAgentType })}
          />
          <TemplatedText
            label={{ en: 'Prompt', fr: 'Invite' }}
            rows={3}
            value={child.prompt ?? ''}
            placeholder={t({ en: 'Child prompt…', fr: 'Invite de l’étape enfant…' })}
            variables={variables}
            onChange={(prompt) => onPatch({ ...(prompt ? { prompt } : { prompt: undefined as unknown as string }) })}
          />
        </>
      ) : (
        <>
          <TemplatedText
            mono
            label={{ en: 'Command', fr: 'Commande' }}
            rows={2}
            value={child.command ?? ''}
            placeholder={t({ en: 'npm run lint', fr: 'npm run lint' })}
            variables={variables}
            onChange={(command) => onPatch({ command })}
          />
          <ShellLimits timeout={child.timeout} codes={child.successExitCodes} onChange={onPatch} />
        </>
      )}
    </div>
  )
}

/** Sets a field, or removes it when the text is emptied. */
function withOptional(step: WorkflowStep, field: 'prompt' | 'nudgePrompt' | 'subGroup', value: string): WorkflowStep {
  const next = { ...step }
  if (value) next[field] = value
  else delete next[field]
  return next
}

interface Props {
  step: WorkflowStep
  isEntry: boolean
  agents: AgentRef[]
  variables: TemplateVariable[]
  onUpdate: (step: WorkflowStep) => void
  onRemove: () => void
  onSetEntry: () => void
}

export function StepPanel({ step, isEntry, agents, variables, onUpdate, onRemove, onSetEntry }: Props) {
  const { color, name } = resolveAgent(step, agents)

  return (
    <div className={styles.panel} data-testid="step-panel">
      <div className={styles.panelHeader}>
        <span className={styles.badge} style={{ color }}>
          {name}
        </span>
        {isEntry && <span className={styles.badge}>{t({ en: 'Entry', fr: 'Entrée' })}</span>}
        <span className={styles.spacer} />
        {!isEntry && (
          <button type="button" className={styles.link} onClick={onSetEntry}>
            {t({ en: 'Set entry', fr: 'Définir comme entrée' })}
          </button>
        )}
        <button type="button" className={styles.linkDanger} data-testid="step-delete" onClick={onRemove}>
          {t({ en: 'Delete', fr: 'Supprimer' })}
        </button>
      </div>
      <label className={styles.field}>
        {t({ en: 'Name', fr: 'Nom' })}
        <input
          data-testid="step-name"
          value={step.name}
          onChange={(event) => onUpdate({ ...step, name: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        {t({ en: 'Type', fr: 'Type' })}
        <select
          data-testid="step-type"
          value={step.type}
          onChange={(event) => onUpdate(changeStepType(step, event.target.value as StepType, agents))}
        >
          {STEP_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </label>
      {step.type === 'agent' && (
        <label className={styles.field}>
          {t({ en: 'Agent type', fr: 'Type d’agent' })}
          <select
            value={step.agentId ?? 'builder'}
            onChange={(event) =>
              onUpdate({
                ...step,
                agentId: event.target.value,
                name: agents.find((agent) => agent.id === event.target.value)?.name ?? event.target.value,
              })
            }
          >
            {agents
              .filter((agent) => !agent.subagent)
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {step.type === 'sub_agent' && (
        <SubAgentSelect
          value={step.subAgentType ?? ''}
          agents={agents}
          onChange={(id) =>
            onUpdate({ ...step, subAgentType: id, name: agents.find((agent) => agent.id === id)?.name ?? id })
          }
        />
      )}
      {(step.type === 'agent' || step.type === 'sub_agent') && (
        <>
          <TemplatedText
            label={{ en: 'Prompt', fr: 'Invite' }}
            rows={6}
            value={step.prompt ?? ''}
            placeholder={t({ en: 'Injected on first entry…', fr: 'Injecté à la première entrée…' })}
            variables={variables}
            onChange={(value) => onUpdate(withOptional(step, 'prompt', value))}
          />
          <TemplatedText
            label={{ en: 'Nudge prompt', fr: 'Invite de relance' }}
            rows={6}
            value={step.nudgePrompt ?? ''}
            placeholder={t({ en: 'Injected on re-entry…', fr: 'Injecté à chaque ré-entrée…' })}
            variables={variables}
            onChange={(value) => onUpdate(withOptional(step, 'nudgePrompt', value))}
          />
        </>
      )}
      {step.type === 'shell' && (
        <>
          <TemplatedText
            mono
            label={{ en: 'Command', fr: 'Commande' }}
            rows={3}
            value={step.command ?? ''}
            placeholder={t({ en: 'cd {{workdir}} && npm run lint', fr: 'cd {{workdir}} && npm run lint' })}
            variables={variables}
            onChange={(command) => onUpdate({ ...step, command })}
          />
          <ShellLimits
            timeout={step.timeout}
            codes={step.successExitCodes}
            onChange={(patch) => onUpdate({ ...step, ...patch })}
          />
        </>
      )}
      {step.type === 'parallel' && (
        <>
          <label className={styles.field}>
            {t({ en: 'Max concurrency', fr: 'Concurrence max' })}
            <input
              type="number"
              data-mono
              value={step.maxConcurrency ?? ''}
              placeholder={t({ en: 'all children', fr: 'tous les enfants' })}
              onChange={(event) => {
                const next = { ...step }
                if (event.target.value === '') delete next.maxConcurrency
                else next.maxConcurrency = Number(event.target.value)
                onUpdate(next)
              }}
            />
          </label>
          {step.children?.map((child, index) => (
            <ChildEditor
              key={index}
              child={child}
              agents={agents}
              variables={variables}
              onPatch={(patch) => onUpdate(patchParallelChild(step, index, patch))}
              onRemove={() =>
                onUpdate({ ...step, children: step.children!.filter((_, position) => position !== index) })
              }
            />
          ))}
          <button type="button" className={styles.dashed} onClick={() => onUpdate(addParallelChild(step))}>
            {t({ en: 'Add child step', fr: 'Ajouter une étape enfant' })}
          </button>
        </>
      )}
      <label className={styles.field}>
        {t({ en: 'Sub-group', fr: 'Sous-groupe' })}
        <input
          value={step.subGroup ?? ''}
          placeholder={t({ en: 'e.g. build, verify, review', fr: 'ex. build, verify, review' })}
          onChange={(event) => onUpdate(withOptional(step, 'subGroup', event.target.value))}
        />
      </label>
      <p className={styles.hint}>
        {t(
          {
            en: {
              one: '{{count}} outgoing transition. Drag from the bottom port to connect.',
              other: '{{count}} outgoing transitions. Drag from the bottom port to connect.',
            },
            fr: {
              one: '{{count}} transition sortante. Faites glisser depuis le port du bas pour connecter.',
              other: '{{count}} transitions sortantes. Faites glisser depuis le port du bas pour connecter.',
            },
          },
          { count: step.transitions.length },
        )}
      </p>
    </div>
  )
}
