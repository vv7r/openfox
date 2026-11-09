import { ChevronDown, GitBranch, PanelRightClose, PanelRightOpen } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { setLayout, toggleColumn } from '../controller'
import { t } from '../i18n'
import { Link, navigate, useRoute } from '../router'
import { useApp, type LayoutMode } from '../store/app'
import styles from './Shell.module.css'

const LAYOUTS: Array<{ mode: LayoutMode; label: { en: string; fr: string } }> = [
  { mode: 'editor-first', label: { en: 'Editor-first', fr: 'Éditeur d’abord' } },
  { mode: 'agent-first', label: { en: 'Agent-first', fr: 'Agent d’abord' } },
]

function ProjectMenu() {
  const projects = useApp((state) => state.projects)
  const { projectId } = useRoute()
  const current = projects.find((project) => project.id === projectId)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.menuTrigger}>
        <span className={styles.truncate}>
          {current?.name ?? t({ en: 'Select a project', fr: 'Choisir un projet' })}
        </span>
        <ChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="start" sideOffset={6}>
          {projects.map((project) => (
            <DropdownMenu.Item
              key={project.id}
              className={styles.menuItem}
              onSelect={() => navigate(`/p/${project.id}`)}
            >
              {project.name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function Header() {
  const layout = useApp((state) => state.layout)
  const branch = useApp((state) => state.git?.branch ?? null)
  const running = useApp((state) => state.session?.isRunning === true)
  const hasSession = useApp((state) => state.session !== null)
  const model = useApp((state) => state.session?.providerModel ?? state.model)
  const rightCollapsed = useApp((state) => state.rightCollapsed)
  const RightToggle = rightCollapsed ? PanelRightOpen : PanelRightClose

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <img src="/assets/openfox-192.png" alt={t({ en: 'OpenFox logo', fr: 'Logo OpenFox' })} width={24} height={24} />
        <span className={styles.wordmark}>{t({ en: 'OpenFox', fr: 'OpenFox' })}</span>
      </Link>
      <span className={styles.divider} />
      <span className={styles.muted}>{t({ en: 'Workspace', fr: 'Espace' })}</span>
      <ProjectMenu />
      {branch && (
        <>
          <span className={styles.divider} />
          <span className={styles.branch}>
            <GitBranch size={14} />
            <span className={styles.truncate}>{branch}</span>
          </span>
        </>
      )}
      <div className={styles.grow} />
      <div className={styles.segmented} role="group" aria-label={t({ en: 'Layout', fr: 'Disposition' })}>
        {LAYOUTS.map(({ mode, label }) => (
          <button key={mode} type="button" aria-pressed={layout === mode} onClick={() => setLayout(mode)}>
            {t(label)}
          </button>
        ))}
      </div>
      {hasSession && (
        <span className={styles.status} data-testid="agent-status">
          <span className={styles.statusDot} data-running={running || undefined} />
          {running ? t({ en: 'Agent running', fr: 'Agent en cours' }) : t({ en: 'Agent ready', fr: 'Agent prêt' })}
        </span>
      )}
      {model && <span className={styles.model}>{model}</span>}
      <button
        type="button"
        className={styles.iconButton}
        title={
          rightCollapsed
            ? t({ en: 'Show right panel', fr: 'Afficher le panneau droit' })
            : t({ en: 'Hide right panel', fr: 'Masquer le panneau droit' })
        }
        onClick={() => toggleColumn('right')}
      >
        <RightToggle size={18} />
      </button>
    </header>
  )
}
