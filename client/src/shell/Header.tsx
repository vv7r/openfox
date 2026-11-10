import { Bell, ChevronDown, GitBranch, Menu, PanelRightClose, PanelRightOpen } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { openPanel, startNewProject, toggleColumn } from '../controller'
import { t } from '../i18n'
import { Link, navigate, useRoute } from '../router'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { useApp, type PanelId } from '../store/app'
import styles from './Shell.module.css'

const MOBILE_PANELS: Array<{ panel: PanelId; label: { en: string; fr: string } }> = [
  { panel: 'tasks', label: { en: 'Tasks', fr: 'Tâches' } },
  { panel: 'git', label: { en: 'Branches', fr: 'Branches' } },
  { panel: 'processes', label: { en: 'Processes', fr: 'Processus' } },
  { panel: 'mcp', label: { en: 'MCP servers', fr: 'Serveurs MCP' } },
  { panel: 'notifications', label: { en: 'Notifications', fr: 'Notifications' } },
  { panel: 'settings', label: { en: 'Settings and plugins', fr: 'Paramètres et plugins' } },
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
        <DropdownMenu.Content
          className={styles.menu}
          align="start"
          sideOffset={6}
          // Focus back on the trigger would close the new project field as soon as it opens
          onCloseAutoFocus={(event) => useApp.getState().creatingProject && event.preventDefault()}
        >
          {projects.map((project) => (
            <DropdownMenu.Item
              key={project.id}
              className={styles.menuItem}
              onSelect={() => navigate(`/p/${project.id}`)}
            >
              {project.name}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item className={styles.menuItem} onSelect={startNewProject}>
            {t({ en: 'New project…', fr: 'Nouveau projet…' })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function Header() {
  const runningTasks = useApp((state) => state.runningTasks)
  const branch = useApp((state) => state.git?.branch ?? null)
  const rightCollapsed = useApp((state) => state.rightCollapsed)
  const unread = useApp((state) => state.unreadNotifications)
  const notificationsOpen = useApp((state) => state.panel === 'notifications')
  const pluginContext = usePluginContext()
  const RightToggle = rightCollapsed ? PanelRightOpen : PanelRightClose

  return (
    <header className={styles.header}>
      <PluginZone id="header.brand" context={pluginContext}>
        <Link href="/" className={styles.brand}>
          <img
            src="/assets/openfox-192.png"
            alt={t({ en: 'OpenFox logo', fr: 'Logo OpenFox' })}
            width={24}
            height={24}
          />
          <span className={styles.wordmark}>{t({ en: 'OpenFox', fr: 'OpenFox' })}</span>
        </Link>
      </PluginZone>
      <span className={styles.divider} />
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
      <PluginZone id="header.nav" context={pluginContext} />
      <div className={styles.grow} />
      <PluginZone id="header.actions" context={pluginContext} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={styles.mobileMenu} aria-label={t({ en: 'Menu', fr: 'Menu' })}>
          <Menu size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
            {MOBILE_PANELS.map(({ panel, label }) => (
              <DropdownMenu.Item key={panel} className={styles.menuItem} onSelect={() => openPanel(panel)}>
                {t(label)}
                {panel === 'tasks' && runningTasks > 0 && ` (${runningTasks})`}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        type="button"
        className={styles.iconButton}
        data-testid="header-notifications"
        data-active={notificationsOpen || undefined}
        title={t({ en: 'Notifications', fr: 'Notifications' })}
        aria-label={t({ en: 'Notifications', fr: 'Notifications' })}
        onClick={() => openPanel('notifications')}
      >
        <Bell size={18} />
        {unread > 0 && <span className={styles.railBadge}>{unread > 99 ? '99+' : unread}</span>}
      </button>
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
