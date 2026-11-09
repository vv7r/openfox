import type { ComponentType } from 'react'
import {
  Bell,
  Columns2,
  Cpu,
  GitBranch,
  House,
  ListTodo,
  LogOut,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
} from 'lucide-react'
import { logout, openPanel, toggleColumn } from '../controller'
import { t } from '../i18n'
import { PluginMenu } from '../plugins/PluginMenu'
import { Link, usePath, useRoute } from '../router'
import { useApp, type PanelId } from '../store/app'
import styles from './Shell.module.css'

function PanelButton({
  panel,
  icon: Icon,
  label,
  badge = 0,
}: {
  panel: PanelId
  icon: ComponentType<{ size?: number }>
  label: string
  badge?: number
}) {
  const active = useApp((state) => state.panel === panel)
  return (
    <button
      type="button"
      className={styles.railItem}
      data-active={active || undefined}
      data-testid={`rail-${panel}`}
      title={label}
      onClick={() => openPanel(panel)}
    >
      <Icon size={20} />
      {badge > 0 && <span className={styles.railBadge}>{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

export function Rail() {
  const { projectId, sessionId } = useRoute()
  const path = usePath()
  const collapsed = useApp((state) => state.leftCollapsed)
  const unread = useApp((state) => state.unreadNotifications)
  const requiresAuth = useApp((state) => state.requiresAuth)
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <nav className={styles.rail}>
      <Link
        href="/"
        className={styles.railItem}
        data-active={path === '/' || undefined}
        title={t({ en: 'Home', fr: 'Accueil' })}
      >
        <House size={20} />
      </Link>
      {projectId && (
        <Link
          href={`/p/${projectId}`}
          className={styles.railItem}
          data-active={path !== '/split-view' || undefined}
          title={t({ en: 'Sessions', fr: 'Sessions' })}
        >
          <MessagesSquare size={20} />
        </Link>
      )}
      {projectId && (
        <PanelButton panel="tasks" icon={ListTodo} label={t({ en: 'Project tasks', fr: 'Tâches du projet' })} />
      )}
      {sessionId && (
        <PanelButton
          panel="git"
          icon={GitBranch}
          label={t({ en: 'Branches and workspaces', fr: 'Branches et espaces' })}
        />
      )}
      {sessionId && (
        <PanelButton
          panel="processes"
          icon={Cpu}
          label={t({ en: 'Processes and dev server', fr: 'Processus et serveur de dev' })}
        />
      )}
      {sessionId && <PanelButton panel="mcp" icon={Plug} label={t({ en: 'MCP servers', fr: 'Serveurs MCP' })} />}
      <Link
        href="/split-view"
        className={styles.railItem}
        data-active={path === '/split-view' || undefined}
        title={t({ en: 'Split view', fr: 'Vue divisée' })}
      >
        <Columns2 size={20} />
      </Link>
      <div className={styles.grow} />
      <PluginMenu
        classes={{ trigger: styles.railItem!, menu: styles.menu!, item: styles.menuItem!, group: styles.menuGroup! }}
      />
      <PanelButton
        panel="notifications"
        icon={Bell}
        label={t({ en: 'Notifications', fr: 'Notifications' })}
        badge={unread}
      />
      <PanelButton panel="settings" icon={Settings} label={t({ en: 'Settings', fr: 'Paramètres' })} />
      {requiresAuth && (
        <button
          type="button"
          className={styles.railItem}
          title={t({ en: 'Log out', fr: 'Se déconnecter' })}
          onClick={logout}
        >
          <LogOut size={20} />
        </button>
      )}
      <button
        type="button"
        className={styles.railItem}
        title={
          collapsed
            ? t({ en: 'Show left panel', fr: 'Afficher le panneau gauche' })
            : t({ en: 'Hide left panel', fr: 'Masquer le panneau gauche' })
        }
        onClick={() => toggleColumn('left')}
      >
        <Toggle size={20} />
      </button>
    </nav>
  )
}
