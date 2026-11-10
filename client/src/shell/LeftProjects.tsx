import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis, Plus } from 'lucide-react'
import { openProject } from '../actions'
import { t } from '../i18n'
import { Link } from '../router'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

/** Letters, digits, `.`, `_` and `-`, as a folder name: never `.` or `..`. */
const isValidProjectName = (name: string): boolean => /^[\w.-]+$/.test(name) && !/^\.+$/.test(name)

const stopCreating = () => useApp.setState({ creatingProject: false })

function NewProjectRow() {
  const root = useApp((state) => state.projectsRoot)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // Opened from a menu, whose focus trap takes the focus back while it closes
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  const trimmed = name.trim()
  const path = root && trimmed ? `${root.replace(/\/$/, '')}/${trimmed}` : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!path || busy) return
    if (!isValidProjectName(trimmed)) {
      setError(
        t({
          en: 'Use only letters, numbers, hyphens, underscores and dots.',
          fr: 'Utilisez uniquement des lettres, chiffres, tirets, tirets bas et points.',
        }),
      )
      return
    }
    setBusy(true)
    void openProject(trimmed, path).then((failure) => {
      if (failure === null) {
        stopCreating()
        return
      }
      setError(failure)
      setBusy(false)
    })
  }

  return (
    <form onSubmit={submit}>
      <input
        ref={input}
        className={styles.rowInput}
        data-testid="new-project-name"
        autoFocus
        value={name}
        readOnly={busy}
        aria-label={t({ en: 'Project name', fr: 'Nom du projet' })}
        placeholder={t({ en: 'my-project', fr: 'mon-projet' })}
        onChange={(event) => {
          setName(event.target.value)
          setError(null)
        }}
        // Text already typed stays: leaving the field must not create a folder or lose the name
        onBlur={() => !trimmed && stopCreating()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') stopCreating()
        }}
      />
      {path && <p className={styles.newProjectPath}>{path}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </form>
  )
}

export default function LeftProjects() {
  const projects = useApp((state) => state.projects)
  const creating = useApp((state) => state.creatingProject)
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.eyebrow}>{t({ en: 'Projects', fr: 'Projets' })}</h2>
        <button
          type="button"
          className={styles.textButton}
          data-testid="new-project"
          onClick={() => useApp.setState({ creatingProject: true })}
        >
          <Plus size={12} />
          {t({ en: 'New', fr: 'Nouveau' })}
        </button>
      </div>
      {creating && <NewProjectRow />}
      {projects.map((project) => (
        <div key={project.id} className={styles.sessionRow}>
          <Link href={`/p/${project.id}`} className={styles.row} title={project.workdir}>
            <span className={styles.projectName}>{project.name}</span>
          </Link>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={styles.rowMenu}
              data-testid="project-row-menu"
              aria-label={t({ en: 'Project options', fr: 'Options du projet' })}
            >
              <Ellipsis size={14} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  data-danger
                  data-testid="project-row-delete"
                  onSelect={() =>
                    useApp.setState({
                      appDialog: {
                        kind: 'delete-project',
                        projectId: project.id,
                        name: project.name,
                        workdir: project.workdir,
                      },
                    })
                  }
                >
                  {t({ en: 'Delete', fr: 'Supprimer' })}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ))}
    </section>
  )
}
