import { useCallback, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react'
import { t } from '../../i18n'
import panelStyles from '../Panels.module.css'
import { commandSlug } from '../library/form'
import { DestinationField } from '../library/LibraryParts'
import { ConditionFields } from './Conditions'
import {
  addTransition,
  buildWorkflow,
  conditionLabel,
  moveSource,
  moveTransition,
  nextStepId,
  parseEdgeKey,
  removeStep,
  removeTransition,
  retarget,
  updateTransition,
  validateDraft,
  type Draft,
} from './editing'
import { FlowDiagram } from './FlowDiagram'
import { resolveAgent } from './layout'
import { StepPanel } from './StepPanel'
import { TransitionPanel } from './TransitionPanel'
import type { AgentRef, TemplateVariable, WorkflowFull, WorkflowParameter, WorkflowStep } from './types'
import styles from './Workflows.module.css'

function resultsOf(step: WorkflowStep | undefined, agents: AgentRef[]): string[] | undefined {
  if (!step || (step.type !== 'agent' && step.type !== 'sub_agent')) return undefined
  const id = step.type === 'sub_agent' ? step.subAgentType : step.agentId
  return agents.find((agent) => agent.id === id)?.results
}

function ParametersSection({
  parameters,
  onChange,
}: {
  parameters: WorkflowParameter[]
  onChange: (parameters: WorkflowParameter[]) => void
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  const patch = (index: number, change: Partial<WorkflowParameter>) =>
    onChange(parameters.map((parameter, position) => (position === index ? { ...parameter, ...change } : parameter)))
  const move = (index: number, delta: -1 | 1) => {
    const next = [...parameters]
    ;[next[index], next[index + delta]] = [next[index + delta]!, next[index]!]
    onChange(next)
  }
  return (
    <section className={styles.parameters}>
      <button type="button" className={styles.disclosure} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron size={13} />
        {t({ en: 'Parameters ({{count}})', fr: 'Paramètres ({{count}})' }, { count: parameters.length })}
      </button>
      {open && (
        <div className={styles.parameterList}>
          {parameters.map((parameter, index) => (
            <div key={index} className={styles.parameter}>
              <input
                data-mono
                value={parameter.id}
                placeholder={t({ en: 'ID', fr: 'ID' })}
                onChange={(event) => patch(index, { id: event.target.value })}
              />
              <input
                value={parameter.label}
                placeholder={t({ en: 'Label', fr: 'Libellé' })}
                onChange={(event) => patch(index, { label: event.target.value })}
              />
              <input
                className={styles.grow}
                value={parameter.description ?? ''}
                placeholder={t({ en: 'Description', fr: 'Description' })}
                onChange={(event) => patch(index, { description: event.target.value })}
              />
              <label className={panelStyles.check}>
                <input
                  type="checkbox"
                  checked={parameter.required ?? false}
                  onChange={(event) => patch(index, { required: event.target.checked })}
                />
                {t({ en: 'Required', fr: 'Requis' })}
              </label>
              <button
                type="button"
                className={styles.iconButton}
                disabled={index === 0}
                aria-label={t({ en: 'Move up', fr: 'Monter' })}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                disabled={index === parameters.length - 1}
                aria-label={t({ en: 'Move down', fr: 'Descendre' })}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t({ en: 'Remove parameter', fr: 'Supprimer le paramètre' })}
                onClick={() => onChange(parameters.filter((_, position) => position !== index))}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.link}
            onClick={() =>
              onChange([
                ...parameters,
                { id: `param_${parameters.length + 1}`, label: '', description: '', required: false },
              ])
            }
          >
            {t({ en: 'Add parameter', fr: 'Ajouter un paramètre' })}
          </button>
        </div>
      )}
    </section>
  )
}

interface Props {
  initial: Draft
  editingId: string | null
  readOnly: boolean
  agents: AgentRef[]
  variables: TemplateVariable[]
  projectAvailable: boolean
  onSave: (
    workflow: WorkflowFull,
    destination: Draft['destination'],
    editingId: string | null,
  ) => Promise<string | null>
  onClose: () => void
}

export function WorkflowEditor({
  initial,
  editingId: initialEditingId,
  readOnly: initialReadOnly,
  agents,
  variables,
  projectAvailable,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(initial)
  const [editingId, setEditingId] = useState(initialEditingId)
  const [readOnly, setReadOnly] = useState(initialReadOnly)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [edgeKey, setEdgeKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patch = useCallback((change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change })), [])
  const setSteps = useCallback(
    (update: (steps: WorkflowStep[]) => WorkflowStep[]) =>
      setDraft((current) => ({ ...current, steps: update(current.steps) })),
    [],
  )

  const selectNode = useCallback((id: string | null) => {
    setNodeId(id)
    setEdgeKey(null)
  }, [])
  const selectEdge = useCallback((key: string | null) => {
    setEdgeKey(key)
    setNodeId(null)
  }, [])

  const selectedStep = draft.steps.find((step) => step.id === nodeId)
  const startLabel = useMemo(() => conditionLabel(draft.startCondition), [draft.startCondition])

  const addStep = () => {
    const id = nextStepId(draft.steps)
    const agent = agents.find((item) => !item.subagent)
    setDraft((current) => ({
      ...current,
      entryStep: current.entryStep || id,
      steps: [
        ...current.steps,
        {
          id,
          name: agent?.name ?? t({ en: 'Agent', fr: 'Agent' }),
          type: 'agent',
          phase: 'build',
          agentId: agent?.id ?? 'builder',
          transitions: [],
        },
      ],
    }))
    selectNode(id)
  }

  const createTransition = useCallback(
    (from: string, to: string) => {
      if (from === '$start') {
        patch({ entryStep: to })
        selectEdge('start')
        return
      }
      setDraft((current) => {
        const result = addTransition(current.steps, from, to)
        selectEdge(result.edgeKey)
        return { ...current, steps: result.steps }
      })
    },
    [patch, selectEdge],
  )

  const reconnectTo = useCallback(
    (key: string, target: string) => {
      if (key === 'start') patch({ entryStep: target })
      else setSteps((steps) => retarget(steps, key, target))
    },
    [patch, setSteps],
  )

  const reconnectFrom = useCallback(
    (key: string, source: string) => {
      setSteps((steps) => moveSource(steps, key, source))
      setEdgeKey(null)
    },
    [setSteps],
  )

  const deleteTransition = useCallback(
    (key: string) => {
      if (key === 'start') patch({ entryStep: '' })
      else setSteps((steps) => removeTransition(steps, key))
      setEdgeKey(null)
    },
    [patch, setSteps],
  )

  const save = async (close: boolean) => {
    const invalid = validateDraft(draft)
    if (invalid) {
      setError(t(invalid))
      return
    }
    const id = editingId ?? draft.id
    setSaving(true)
    setError(null)
    const failure = await onSave(buildWorkflow(draft, id), draft.destination, editingId)
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setEditingId(id)
    if (close) onClose()
  }

  const parsedEdge = edgeKey && edgeKey !== 'start' ? parseEdgeKey(edgeKey) : null
  const edgeStep = parsedEdge ? draft.steps.find((step) => step.id === parsedEdge.stepId) : undefined
  const transition = parsedEdge ? edgeStep?.transitions[parsedEdge.index] : undefined
  const labelOf = (id: string) => {
    if (id === '$done') return t({ en: 'Done', fr: 'Terminé' })
    const step = draft.steps.find((item) => item.id === id)
    return step ? resolveAgent(step, agents).name : id
  }

  const properties = () => {
    if (readOnly && (edgeKey || selectedStep)) {
      return (
        <p className={styles.empty}>
          {t({
            en: 'View only: use “Duplicate and customize” to edit.',
            fr: 'Lecture seule : utilisez « Dupliquer et personnaliser » pour modifier.',
          })}
        </p>
      )
    }
    if (edgeKey === 'start') {
      return (
        <div className={styles.panel} data-testid="start-panel">
          <div className={styles.route}>
            <strong>{t({ en: 'Start', fr: 'Début' })}</strong>
            <ArrowRight size={12} />
            <strong>{draft.entryStep ? labelOf(draft.entryStep) : '—'}</strong>
          </div>
          <ConditionFields
            label={{ en: 'Activation condition', fr: 'Condition d’activation' }}
            condition={draft.startCondition}
            results={resultsOf(
              draft.steps.find((step) => step.id === draft.entryStep),
              agents,
            )}
            onChange={(startCondition) => patch({ startCondition })}
          />
          <p className={styles.hint}>
            {t({
              en: 'The workflow only proceeds when this condition is met. Drag the target handle to change the entry step.',
              fr: 'Le workflow ne démarre que si cette condition est remplie. Faites glisser la poignée cible pour changer l’étape d’entrée.',
            })}
          </p>
        </div>
      )
    }
    if (edgeKey && parsedEdge && edgeStep && transition) {
      return (
        <TransitionPanel
          key={edgeKey}
          fromLabel={labelOf(edgeStep.id)}
          toLabel={labelOf(transition.goto)}
          condition={transition.when}
          subGroup={transition.subGroup}
          fromStep={edgeStep}
          results={resultsOf(edgeStep, agents)}
          index={parsedEdge.index}
          total={edgeStep.transitions.length}
          onCondition={(when) => setSteps((steps) => updateTransition(steps, edgeKey, (item) => ({ ...item, when })))}
          onSubGroup={(subGroup) =>
            setSteps((steps) =>
              updateTransition(steps, edgeKey, (item) => {
                const next = { ...item }
                if (subGroup) next.subGroup = subGroup
                else delete next.subGroup
                return next
              }),
            )
          }
          onDelete={() => deleteTransition(edgeKey)}
          onMove={(delta) =>
            setDraft((current) => {
              const result = moveTransition(current.steps, edgeKey, delta)
              setEdgeKey(result.edgeKey)
              return { ...current, steps: result.steps }
            })
          }
        />
      )
    }
    if (selectedStep) {
      return (
        <StepPanel
          key={selectedStep.id}
          step={selectedStep}
          isEntry={selectedStep.id === draft.entryStep}
          agents={agents}
          variables={variables}
          onUpdate={(updated) =>
            setSteps((steps) => steps.map((step) => (step.id === selectedStep.id ? updated : step)))
          }
          onRemove={() => {
            setDraft((current) => removeStep(current, selectedStep.id))
            selectNode(null)
          }}
          onSetEntry={() => patch({ entryStep: selectedStep.id })}
        />
      )
    }
    return (
      <p className={styles.empty}>
        {t({
          en: 'Click a node or edge to edit. Drag from a port to connect.',
          fr: 'Cliquez sur un nœud ou une arête pour modifier. Faites glisser depuis un port pour connecter.',
        })}
      </p>
    )
  }

  const title = readOnly
    ? draft.name
    : editingId
      ? t({ en: 'Edit workflow', fr: 'Modifier le workflow' })
      : t({ en: 'New workflow', fr: 'Nouveau workflow' })

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content
          className={`${panelStyles.dialog} ${styles.editor}`}
          data-testid="workflow-editor"
          aria-describedby={undefined}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>{title}</Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={`${panelStyles.body} ${styles.editorBody}`}>
            {error && <p className={panelStyles.error}>{error}</p>}
            <div className={styles.metadata}>
              <label className={styles.field}>
                {t({ en: 'Name', fr: 'Nom' })}
                <input
                  data-testid="workflow-name"
                  value={draft.name}
                  readOnly={readOnly}
                  onChange={(event) =>
                    patch({ name: event.target.value, ...(editingId ? {} : { id: commandSlug(event.target.value) }) })
                  }
                />
              </label>
              <label className={styles.field}>
                {t({ en: 'ID', fr: 'ID' })}
                <input data-mono value={draft.id} readOnly />
              </label>
              <label className={`${styles.field} ${styles.grow}`}>
                {t({ en: 'Description', fr: 'Description' })}
                <input
                  value={draft.description}
                  readOnly={readOnly}
                  onChange={(event) => patch({ description: event.target.value })}
                />
              </label>
              <label className={`${styles.field} ${styles.narrowField}`}>
                {t({ en: 'Max iter.', fr: 'Itér. max' })}
                <input
                  type="number"
                  data-mono
                  value={draft.maxIterations}
                  readOnly={readOnly}
                  onChange={(event) => patch({ maxIterations: Number(event.target.value) })}
                />
              </label>
              <label className={styles.field}>
                {t({ en: 'Color', fr: 'Couleur' })}
                <input
                  type="color"
                  value={draft.color}
                  disabled={readOnly}
                  onChange={(event) => patch({ color: event.target.value })}
                />
              </label>
            </div>
            {!readOnly && (
              <ParametersSection parameters={draft.parameters} onChange={(parameters) => patch({ parameters })} />
            )}
            {!editingId && !readOnly && (
              <DestinationField
                value={draft.destination}
                projectAvailable={projectAvailable}
                onChange={(destination) => patch({ destination })}
              />
            )}
            <div className={styles.workspace}>
              <div className={styles.flow}>
                <div className={styles.paneHeader}>
                  <span>{t({ en: 'Flow', fr: 'Flux' })}</span>
                  {!readOnly && (
                    <button type="button" className={styles.link} data-testid="workflow-add-step" onClick={addStep}>
                      {t({ en: 'Add step', fr: 'Ajouter une étape' })}
                    </button>
                  )}
                </div>
                <div className={styles.flowScroll}>
                  <FlowDiagram
                    steps={draft.steps}
                    entryStep={draft.entryStep}
                    selectedNodeId={selectedStep?.id ?? null}
                    selectedEdgeKey={edgeKey}
                    startConditionLabel={startLabel}
                    agentTypes={agents}
                    isReadOnly={readOnly}
                    onSelectNode={selectNode}
                    onSelectEdge={selectEdge}
                    onRemoveStep={(id) => {
                      setDraft((current) => removeStep(current, id))
                      if (nodeId === id) selectNode(null)
                    }}
                    onCreateTransition={createTransition}
                    onReconnectTo={reconnectTo}
                    onReconnectFrom={reconnectFrom}
                    onDeleteTransition={deleteTransition}
                  />
                </div>
              </div>
              <div className={styles.properties}>
                <div className={styles.paneHeader}>
                  <span>{t({ en: 'Properties', fr: 'Propriétés' })}</span>
                </div>
                <div className={styles.propertiesScroll}>{properties()}</div>
              </div>
            </div>
            <div className={panelStyles.row}>
              <span className={panelStyles.grow} />
              <button type="button" onClick={onClose}>
                {t({ en: 'Close', fr: 'Fermer' })}
              </button>
              {readOnly ? (
                <button
                  type="button"
                  className={panelStyles.primary}
                  onClick={() => {
                    patch({
                      name: `${draft.name} ${t({ en: '(copy)', fr: '(copie)' })}`,
                      id: `${editingId ?? draft.id}-copy-${Date.now()}`,
                    })
                    setEditingId(null)
                    setReadOnly(false)
                  }}
                >
                  {t({ en: 'Duplicate and customize', fr: 'Dupliquer et personnaliser' })}
                </button>
              ) : (
                <>
                  <button type="button" disabled={saving} data-testid="workflow-save" onClick={() => void save(false)}>
                    {t({ en: 'Save', fr: 'Enregistrer' })}
                  </button>
                  <button
                    type="button"
                    className={panelStyles.primary}
                    disabled={saving}
                    data-testid="workflow-save-close"
                    onClick={() => void save(true)}
                  >
                    {t({ en: 'Save and close', fr: 'Enregistrer et fermer' })}
                  </button>
                </>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
