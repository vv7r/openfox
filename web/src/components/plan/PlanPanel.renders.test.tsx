// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@shared/types.js'
import { useSessionStore } from '../../stores/session'

// Render counters for the children PlanPanel owns.
const renders = vi.hoisted(() => ({ chatInput: 0, messageList: 0, lastFeedText: '' }))

vi.mock('./ChatInput', () => ({
  ChatInput: () => {
    renders.chatInput++
    return null
  },
}))

vi.mock('./MessageList', () => ({
  MessageList: ({ displayItems }: { displayItems: Array<{ type: string; message?: Message }> }) => {
    renders.messageList++
    renders.lastFeedText = displayItems.map((item) => item.message?.content ?? '').join('|')
    return null
  },
}))

vi.mock('../layout/SessionLayout', () => ({
  SessionLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../shared/ConnectionStatusBar', () => ({ ConnectionStatusBar: () => null }))
vi.mock('./SidebarSummaryHeader', () => ({ SidebarSummaryHeader: () => null }))
vi.mock('../settings/CommandsModal', () => ({ CommandsModal: () => null }))
vi.mock('../settings/WorkflowsModal', () => ({ WorkflowsModal: () => null }))
vi.mock('../QuickActionModal', () => ({ QuickActionModal: () => null }))
vi.mock('./useQueuedRebaseTrigger', () => ({ useQueuedRebaseTrigger: () => undefined }))
vi.mock('../../hooks/useAgents', () => ({ useAgents: () => ({ agents: [], refresh: vi.fn() }) }))
vi.mock('../../hooks/useWorkflows', () => ({ useWorkflows: () => ({ workflows: [] }) }))
vi.mock('../../hooks/useKeybindings', () => ({
  useKeybindings: () => ({}),
  useBinding: vi.fn(),
  useAgentSwitchingBindings: vi.fn(),
}))
vi.mock('../../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ isAutoScrollActive: true, setAutoScroll: vi.fn(), handleScrollbarGesture: vi.fn() }),
}))
vi.mock('../../hooks/useScrolledSend', () => ({
  useScrolledSend: () => ({ sendMessage: vi.fn(), launchWorkflow: vi.fn() }),
}))
vi.mock('../../hooks/useEffortGateContext', () => ({ useEffortGatedAgentSwitch: () => vi.fn() }))
vi.mock('../../hooks/useDisplaySettings', () => ({ useDisplaySettings: () => ({ maxVisibleItems: 100 }) }))

import { PlanPanel } from './PlanPanel'

const user: Message = { id: 'u1', role: 'user', content: 'Explain the pipeline', timestamp: '2026-01-01T00:00:00Z' }
const assistant = (content: string): Message => ({
  id: 'a1',
  role: 'assistant',
  content,
  timestamp: '2026-01-01T00:00:01Z',
  isStreaming: true,
})

describe('PlanPanel — streaming renders', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    renders.chatInput = 0
    renders.messageList = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useSessionStore.setState({
      currentSession: { id: 's1', projectId: 'p1', workdir: '/tmp/p1', metadataEntries: {} } as never,
      focusedSessionId: null,
      panes: {},
      messages: [user, assistant('Hello')],
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('re-renders only the feed when a streamed delta updates the assistant message', async () => {
    await act(async () => root.render(<PlanPanel />))
    const chatInputBefore = renders.chatInput
    const messageListBefore = renders.messageList
    expect(renders.lastFeedText).toBe('Explain the pipeline|Hello')

    // A streaming flush: same user message object, new assistant message object.
    await act(async () => {
      useSessionStore.setState((state) => ({ messages: [state.messages[0]!, assistant('Hello world')] }))
    })

    expect(renders.messageList).toBe(messageListBefore + 1)
    expect(renders.lastFeedText).toBe('Explain the pipeline|Hello world')
    expect(renders.chatInput).toBe(chatInputBefore)
  })

  it('still re-renders the composer when a new user prompt lands (prompt history)', async () => {
    await act(async () => root.render(<PlanPanel />))
    const chatInputBefore = renders.chatInput

    await act(async () => {
      useSessionStore.setState((state) => ({
        messages: [...state.messages, { ...user, id: 'u2', content: 'And now?', timestamp: '2026-01-01T00:00:02Z' }],
      }))
    })

    expect(renders.chatInput).toBeGreaterThan(chatInputBefore)
  })
})
