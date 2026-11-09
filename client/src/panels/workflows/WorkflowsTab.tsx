import { useEffect, useState } from 'react'
import { Copy, Eye, Pencil, Plus } from 'lucide-react'
import { getJson } from '../../api'
import { useLoad } from '../../hooks'
import { t } from '../../i18n'
import { useApp } from '../../store/app'
import panelStyles from '../Panels.module.css'
import libraryStyles from '../library/Library.module.css'
import { DeleteButton, Section } from '../library/LibraryParts'
import { useLibrary, useProjectDir } from '../library/useLibrary'
import { draftFrom, emptyDraft, type Draft } from './editing'
import type { AgentRef, TemplateVariable, WorkflowFull, WorkflowInfo, WorkflowScope } from './types'
import { WorkflowEditor } from './WorkflowEditor'

type EditorState = { draft: Draft; editingId: string | null; readOnly: boolean; scope: WorkflowScope | undefined }

function copyOf(workflow: WorkflowFull): Draft {
  const draft = draftFrom(workflow)
  return {
    ...draft,
    name: `${draft.name} ${t({ en: '(copy)', fr: '(copie)' })}`,
    id: `${draft.id}-copy-${Date.now()}`,
  }
}

interface AgentLists {
  defaults: AgentRef[]
  userItems: AgentRef[]
  projectItems: AgentRef[]
}

export function WorkflowsTab() {
  const workdir = useProjectDir()
  const library = useLibrary<WorkflowInfo, WorkflowFull>('workflows', workdir)
  const agentLists = useLoad(
    () => getJson<AgentLists>(`/api/agents${workdir ? `?workdir=${encodeURIComponent(workdir)}` : ''}`),
    workdir ?? '',
  )
  const variables = useLoad(
    () => getJson<{ variables: TemplateVariable[] }>('/api/workflows/template-variables'),
    'template-variables',
  )
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const agents = agentLists.data
    ? [...agentLists.data.defaults, ...agentLists.data.userItems, ...agentLists.data.projectItems]
    : []

  const open = (id: string, scope: WorkflowScope | undefined, readOnly: boolean, copy: boolean) => {
    void library.getItem(id, scope === 'builtin', scope).then((workflow) =>
      setEditor({
        draft: copy ? copyOf(workflow) : draftFrom(workflow),
        editingId: copy ? null : id,
        readOnly,
        scope: copy ? undefined : scope,
      }),
    )
  }

  useEffect(() => {
    const target = useApp.getState().settingsEdit
    if (!target) return
    useApp.setState({ settingsEdit: null })
    open(target.id, target.scope, target.scope === 'builtin', false)
    // One shot, on arriving from the composer's menu
  }, [])

  const row = (workflow: WorkflowInfo, scope: WorkflowScope) => (
    <div key={workflow.id} className={libraryStyles.row} data-testid={`workflow-${workflow.id}`}>
      <span className={libraryStyles.colorDot} style={{ background: workflow.color ?? '#3b82f6' }} />
      <span className={panelStyles.grow}>
        {workflow.name}
        {workflow.description && <div className={panelStyles.muted}>{workflow.description}</div>}
      </span>
      {scope === 'builtin' ? (
        <button
          type="button"
          aria-label={t({ en: 'View', fr: 'Voir' })}
          data-testid="workflow-view"
          onClick={() => open(workflow.id, scope, true, false)}
        >
          <Eye size={13} />
        </button>
      ) : (
        <button
          type="button"
          aria-label={t({ en: 'Edit', fr: 'Modifier' })}
          data-testid="workflow-edit"
          onClick={() => open(workflow.id, scope, false, false)}
        >
          <Pencil size={13} />
        </button>
      )}
      <button
        type="button"
        aria-label={t({ en: 'Duplicate', fr: 'Dupliquer' })}
        onClick={() => open(workflow.id, scope, false, true)}
      >
        <Copy size={13} />
      </button>
      {scope !== 'builtin' && <DeleteButton onConfirm={() => void library.remove(workflow.id, scope).then(setError)} />}
    </div>
  )

  const sections: Array<{ title: string; scope: WorkflowScope; items: WorkflowInfo[] | undefined }> = [
    { title: t({ en: 'Built-in', fr: 'Intégrés' }), scope: 'builtin', items: library.data?.defaults },
    { title: t({ en: 'Global', fr: 'Global' }), scope: 'user', items: library.data?.userItems },
    { title: t({ en: 'Project', fr: 'Projet' }), scope: 'project', items: library.data?.projectItems },
  ]

  return (
    <div className={panelStyles.stack} data-testid="workflows-tab">
      <div className={panelStyles.row}>
        <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
          {t({
            en: 'Workflows define multi-step agentic processes with branching transitions.',
            fr: 'Les workflows définissent des processus agentiques en plusieurs étapes avec des transitions conditionnelles.',
          })}
        </span>
        <button
          type="button"
          className={panelStyles.primary}
          data-testid="library-new"
          onClick={() => setEditor({ draft: emptyDraft(), editingId: null, readOnly: false, scope: undefined })}
        >
          <Plus size={12} /> {t({ en: 'New', fr: 'Nouveau' })}
        </button>
      </div>
      {error && <p className={panelStyles.error}>{error}</p>}
      {sections.map(
        (section) =>
          (section.items?.length ?? 0) > 0 && (
            <Section key={section.scope} title={section.title}>
              {section.items!.map((workflow) => row(workflow, section.scope))}
            </Section>
          ),
      )}
      {editor && (
        <WorkflowEditor
          initial={editor.draft}
          editingId={editor.editingId}
          readOnly={editor.readOnly}
          agents={agents}
          variables={variables.data?.variables ?? []}
          projectAvailable={Boolean(workdir)}
          onClose={() => setEditor(null)}
          onSave={(workflow, destination, editingId) =>
            editingId ? library.update(editingId, workflow, editor.scope) : library.create(workflow, destination)
          }
        />
      )}
    </div>
  )
}
