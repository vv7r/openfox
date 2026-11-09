import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import feedStyles from '../../feed/Feed.module.css'
import { t } from '../../i18n'
import panelStyles from '../Panels.module.css'
import { mcpModeOf, parseAllowedTools, serializeTools, setMcpMode, type McpMode, type ToolSelection } from './form'
import styles from './Library.module.css'

export interface AvailableTool {
  name: string
  actions: string[]
  alwaysAllowed?: boolean
  topLevelOnly?: boolean
  isMcp?: boolean
}

interface Props {
  tools: AvailableTool[]
  selected: string[]
  subagent: boolean
  readOnly: boolean
  onChange: (tools: string[]) => void
}

function ActionsMenu({
  tool,
  selection,
  onSelection,
}: {
  tool: AvailableTool
  selection: ToolSelection
  onSelection: (next: ToolSelection) => void
}) {
  const actions = selection.get(tool.name) ?? new Set<string>()
  const selected = selection.has(tool.name)

  const toggle = (action: string) => {
    const nextActions = new Set(actions)
    if (!nextActions.delete(action)) nextActions.add(action)
    onSelection(new Map(selection).set(tool.name, nextActions))
  }

  const toggleAll = () => {
    const next = new Map(selection)
    if (selected) next.delete(tool.name)
    else next.set(tool.name, new Set(tool.actions))
    onSelection(next)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.toolChip} aria-pressed={selected}>
        {tool.name}
        {actions.size > 0 && <span>{` ${actions.size}/${tool.actions.length}`}</span>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={feedStyles.menu} align="start" sideOffset={4}>
          {tool.actions.map((action) => (
            <DropdownMenu.CheckboxItem
              key={action}
              className={`${feedStyles.menuItem} ${styles.checkItem}`}
              checked={actions.has(action)}
              onSelect={(event) => {
                event.preventDefault()
                toggle(action)
              }}
            >
              <DropdownMenu.ItemIndicator>
                <span className={styles.tick} />
              </DropdownMenu.ItemIndicator>
              {action}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Item
            className={feedStyles.menuItem}
            onSelect={(event) => {
              event.preventDefault()
              toggleAll()
            }}
          >
            {selected
              ? t({ en: 'Deselect all', fr: 'Tout désélectionner' })
              : t({ en: 'Select all', fr: 'Tout sélectionner' })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const MCP_MODES: Array<{ mode: McpMode; en: string; fr: string }> = [
  { mode: 'all', en: 'All', fr: 'Tous' },
  { mode: 'none', en: 'None', fr: 'Aucun' },
  { mode: 'partial', en: 'Partial', fr: 'Partiel' },
]

function McpTools({
  tools,
  selection,
  readOnly,
  onSelection,
}: {
  tools: AvailableTool[]
  selection: ToolSelection
  readOnly: boolean
  onSelection: (next: ToolSelection) => void
}) {
  const [search, setSearch] = useState('')
  const names = new Set(tools.map((tool) => tool.name))
  const mode = mcpModeOf(selection, names)
  const needle = search.toLowerCase()
  const count = [...selection.keys()].filter((name) => names.has(name)).length

  const toggle = (name: string) => {
    const next = new Map(selection)
    if (!next.delete(name)) next.set(name, new Set())
    onSelection(next)
  }

  return (
    <div className={panelStyles.field}>
      <span>{t({ en: 'MCP tools', fr: 'Outils MCP' })}</span>
      <div className={styles.chips}>
        {MCP_MODES.map((option) => (
          <label key={option.mode} className={panelStyles.check}>
            <input
              type="radio"
              name="mcp-mode"
              checked={mode === option.mode}
              disabled={readOnly}
              onChange={() => onSelection(setMcpMode(selection, names, option.mode))}
            />
            {t(option)}
            {option.mode === 'partial' && ` (${count}/${names.size})`}
          </label>
        ))}
      </div>
      {mode === 'partial' && (
        <>
          <input
            className={panelStyles.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t({ en: 'Search MCP tools…', fr: 'Rechercher des outils MCP…' })}
          />
          <div className={styles.mcpList}>
            {tools
              .filter((tool) => tool.name.toLowerCase().includes(needle))
              .map((tool) => (
                <label key={tool.name} className={panelStyles.check}>
                  <input
                    type="checkbox"
                    checked={selection.has(tool.name)}
                    disabled={readOnly}
                    onChange={() => toggle(tool.name)}
                  />
                  <code>{tool.name}</code>
                </label>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ToolPicker({ tools, selected, subagent, readOnly, onChange }: Props) {
  const selection = parseAllowedTools(selected)
  const usable = tools.filter((tool) => !(subagent && tool.topLevelOnly))
  const onSelection = (next: ToolSelection) => onChange(serializeTools(next))

  const toggle = (name: string) => {
    const next = new Map(selection)
    if (!next.delete(name)) next.set(name, new Set())
    onSelection(next)
  }

  const mcp = usable.filter((tool) => tool.isMcp)
  return (
    <>
      <div className={panelStyles.field}>
        <span>{t({ en: 'Tools', fr: 'Outils' })}</span>
        <div className={styles.toolBox} data-testid="agent-tools">
          {usable
            .filter((tool) => !tool.isMcp)
            .map((tool) =>
              tool.actions.length > 0 && !readOnly ? (
                <ActionsMenu key={tool.name} tool={tool} selection={selection} onSelection={onSelection} />
              ) : (
                <button
                  key={tool.name}
                  type="button"
                  className={styles.toolChip}
                  aria-pressed={selection.has(tool.name)}
                  disabled={readOnly}
                  onClick={() => toggle(tool.name)}
                >
                  {tool.name}
                </button>
              ),
            )}
        </div>
      </div>
      {mcp.length > 0 && <McpTools tools={mcp} selection={selection} readOnly={readOnly} onSelection={onSelection} />}
    </>
  )
}
