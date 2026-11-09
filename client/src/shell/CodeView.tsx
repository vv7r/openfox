import { useEffect, useRef } from 'react'
import { useAgentFiles } from '../feed/agentFiles'
import { t } from '../i18n'
import { reloadFile, saveFile, setDirty, useWorkspace, type FileBody, type Tab } from '../store/workspace'
import { fileSnapshot, markSaved, mountFile, setReadOnly, syncFile } from './editor'
import styles from './Shell.module.css'

window.addEventListener('beforeunload', (event) => {
  if (Object.keys(useWorkspace.getState().dirty).length > 0) event.preventDefault()
})

type TextBody = Extract<FileBody, { content: string }>

async function save(key: string, force = false): Promise<void> {
  const snapshot = fileSnapshot(key)
  if (!snapshot || !(await saveFile(key, snapshot.text, force))) return
  if (!markSaved(key, snapshot.version)) setDirty(key, null)
}

async function reload(key: string): Promise<void> {
  const content = await reloadFile(key)
  if (content !== null) syncFile(key, content)
}

function FileEditor({ tab, body }: { tab: Tab; body: TextBody }) {
  const host = useRef<HTMLDivElement>(null)
  const { key } = tab
  const dirty = useWorkspace((state) => state.dirty[key] === true)
  const saving = useWorkspace((state) => state.saves[key])
  const locked = useAgentFiles().has(tab.path)
  const lockedNow = useRef(locked)
  lockedNow.current = locked

  // Only the first version seeds the editor; later ones go through syncFile below
  const seed = useRef(body)
  useEffect(() => {
    if (!host.current) return
    return mountFile(host.current, {
      key,
      path: seed.current.path,
      content: seed.current.content,
      readOnly: !seed.current.editable,
      onDirty: (next) => setDirty(key, next ? () => fileSnapshot(key)?.text ?? '' : null),
      onSave: () => {
        if (!lockedNow.current) void save(key)
      },
    })
  }, [key])

  useEffect(() => {
    if (!useWorkspace.getState().dirty[key]) syncFile(key, body.content)
  }, [key, body.content])

  useEffect(() => setReadOnly(key, locked || !body.editable), [key, locked, body.editable])

  return (
    <div className={styles.editorPane} data-locked={locked || undefined}>
      <div className={styles.editorBar}>
        <span className={styles.editorPath}>{body.path}</span>
        {locked && (
          <span className={styles.editorWarning} data-testid="file-locked">
            {t({ en: 'The agent is working on this file', fr: 'L’agent travaille sur ce fichier' })}
          </span>
        )}
        {saving === 'conflict' && !locked && (
          <>
            <span className={styles.editorWarning}>
              {t({ en: 'Changed on disk since you opened it', fr: 'Modifié sur le disque depuis son ouverture' })}
            </span>
            <button type="button" onClick={() => void reload(key)}>
              {t({ en: 'Reload', fr: 'Recharger' })}
            </button>
            <button type="button" data-testid="file-overwrite" onClick={() => void save(key, true)}>
              {t({ en: 'Overwrite', fr: 'Écraser' })}
            </button>
          </>
        )}
        {saving === 'error' && (
          <span className={styles.editorWarning}>{t({ en: 'Could not save', fr: 'Échec de l’enregistrement' })}</span>
        )}
        {body.editable ? (
          <button
            type="button"
            data-testid="file-save"
            disabled={!dirty || saving === 'saving' || locked}
            onClick={() => void save(key)}
          >
            {t({ en: 'Save', fr: 'Enregistrer' })}
          </button>
        ) : (
          <span className={styles.editorWarning}>
            {t({ en: 'Read-only: not UTF-8', fr: 'Lecture seule : pas en UTF-8' })}
          </span>
        )}
      </div>
      <div ref={host} className={styles.editor} data-testid="code-view" />
    </div>
  )
}

export default function CodeView({ tab }: { tab: Tab }) {
  const content = useWorkspace((state) => state.contents[tab.key])
  if (!content || content.status === 'loading') {
    return <p className={styles.empty}>{t({ en: 'Loading…', fr: 'Chargement…' })}</p>
  }
  if (content.status === 'error' || 'original' in content.body) {
    return (
      <p className={styles.empty}>
        {t({ en: 'This file cannot be shown', fr: 'Ce fichier ne peut pas être affiché' })}
      </p>
    )
  }
  if ('binary' in content.body) return <p className={styles.empty}>{t({ en: 'Binary file', fr: 'Fichier binaire' })}</p>
  if ('tooLarge' in content.body) {
    return (
      <p className={styles.empty}>
        {t({ en: 'File too large to show', fr: 'Fichier trop volumineux pour être affiché' })}
      </p>
    )
  }
  return <FileEditor tab={tab} body={content.body} />
}
