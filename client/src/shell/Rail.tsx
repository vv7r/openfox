import type { ComponentType } from 'react'
import { Cpu, GitBranch, House, ListTodo, LogOut, MessagesSquare, Plug, Settings } from 'lucide-react'
import type { DevServerState } from '@shared/dev-server.js'
import { logout, openPanel, showHomeColumns, toggleColumn } from '../controller'
import { t } from '../i18n'
import { PluginMenu } from '../plugins/PluginMenu'
import { Link, usePath, useRoute } from '../router'
import { useApp, type PanelId } from '../store/app'
import { devServerTone, type RailTone } from './railStatus'
import styles from './Shell.module.css'

const DEV_SERVER_LABELS: Record<DevServerState, { en: string; fr: string }> = {
  off: { en: 'Processes and dev server', fr: 'Processus et serveur de dev' },
  running: { en: 'Dev server running', fr: 'Serveur de dev en marche' },
  warning: { en: 'Dev server: warning', fr: 'Serveur de dev : avertissement' },
  error: { en: 'Dev server: error', fr: 'Serveur de dev : erreur' },
}

function PanelButton({
  panel,
  icon: Icon,
  label,
  badge = 0,
  tone,
}: {
  panel: PanelId
  icon: ComponentType<{ size?: number }>
  label: string
  badge?: number
  tone?: RailTone | undefined
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
      {tone && <span className={styles.railDot} data-tone={tone} data-testid={`rail-dot-${panel}`} />}
    </button>
  )
}

export function Rail() {
  const { projectId, sessionId } = useRoute()
  const path = usePath()
  const collapsed = useApp((state) => state.leftCollapsed)
  const runningTasks = useApp((state) => state.runningTasks)
  const requiresAuth = useApp((state) => state.requiresAuth)
  const mcpActive = useApp((state) => state.mcpActive)
  const devServerState = useApp((state) => state.devServerState)
  return (
    <nav className={styles.rail}>
      <Link
        href="/"
        className={styles.railItem}
        data-active={path === '/' || undefined}
        data-testid="rail-home"
        title={t({ en: 'Home', fr: 'Accueil' })}
        onClick={showHomeColumns}
      >
        <House size={20} />
      </Link>
      {projectId && (
        <Link
          href={`/p/${projectId}`}
          className={styles.railItem}
          data-active={(path !== '/split-view' && !collapsed) || undefined}
          data-testid="rail-sessions"
          title={
            collapsed
              ? t({ en: 'Show sessions', fr: 'Afficher les sessions' })
              : t({ en: 'Hide sessions', fr: 'Masquer les sessions' })
          }
          onClick={(event) => {
            // Folds or unfolds the list without leaving the open session
            event.preventDefault()
            toggleColumn('left')
          }}
        >
          <MessagesSquare size={20} />
        </Link>
      )}
      {projectId && (
        <PanelButton
          panel="tasks"
          icon={ListTodo}
          label={t({ en: 'Project tasks', fr: 'Tâches du projet' })}
          badge={runningTasks}
        />
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
          label={t(DEV_SERVER_LABELS[devServerState])}
          tone={devServerTone(devServerState)}
        />
      )}
      {sessionId && (
        <PanelButton
          panel="mcp"
          icon={Plug}
          label={
            mcpActive
              ? t({ en: 'MCP servers: active in this session', fr: 'Serveurs MCP : actifs dans cette session' })
              : t({ en: 'MCP servers', fr: 'Serveurs MCP' })
          }
          tone={mcpActive ? 'success' : undefined}
        />
      )}
      <div className={styles.grow} />
      <PluginMenu
        classes={{ trigger: styles.railItem!, menu: styles.menu!, item: styles.menuItem!, group: styles.menuGroup! }}
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
    </nav>
  )
}
