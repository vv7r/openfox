import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Puzzle, Settings } from 'lucide-react'
import { showSettings } from '../controller'
import { t } from '../i18n'
import { activatePluginAction } from './activate'
import { isContributionVisible, localize } from './core'
import { usePluginContext } from './Slots'
import { usePlugins } from './store'

interface PluginMenuStyles {
  trigger: string
  menu: string
  item: string
  group: string
}

export function PluginMenu({ classes }: { classes: PluginMenuStyles }) {
  const plugins = usePlugins((state) => state.plugins)
  const actions = usePlugins((state) => state.contributions.actions)
  const context = usePluginContext()
  const enabled = plugins.filter((plugin) => plugin.enabled)
  const isVisible = (action: (typeof actions)[number]) => isContributionVisible(action.visibleWhen, context)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={classes.trigger}
        title={t({ en: 'Plugins', fr: 'Plugins' })}
        data-testid="plugin-menu"
      >
        <Puzzle size={20} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={classes.menu} side="right" align="end" sideOffset={6}>
          {enabled.map((plugin) => {
            const own = actions.find(
              (action) => action.slot === 'plugin.menu' && action.pluginId === plugin.id && isVisible(action),
            )
            const extra = actions.filter(
              (action) =>
                (action.slot === 'header.actions' || action.slot === 'session.header.actions') &&
                action.pluginId === plugin.id &&
                isVisible(action),
            )
            return (
              <DropdownMenu.Group key={plugin.id}>
                {own ? (
                  <DropdownMenu.Item
                    className={classes.item}
                    onSelect={() => void activatePluginAction(own.pluginId, own.onActivate, context)}
                  >
                    {localize(own.label)}
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Label className={classes.group}>{plugin.displayName}</DropdownMenu.Label>
                )}
                {extra.map((action) => (
                  <DropdownMenu.Item
                    key={action.id}
                    className={classes.item}
                    onSelect={() => void activatePluginAction(action.pluginId, action.onActivate, context)}
                  >
                    {localize(action.label)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Group>
            )
          })}
          {enabled.length === 0 && (
            <DropdownMenu.Label className={classes.group}>
              {t({ en: 'No plugins installed', fr: 'Aucun plugin installé' })}
            </DropdownMenu.Label>
          )}
          <DropdownMenu.Item className={classes.item} onSelect={() => showSettings('plugins')}>
            <Settings size={13} />
            {t({ en: 'Manage plugins', fr: 'Gérer les plugins' })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
