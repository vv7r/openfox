import WebSocket from 'ws'
import { terminalManager } from '../terminal/manager.js'

interface TerminalMessage {
  type: 'terminal.subscribe' | 'terminal.write' | 'terminal.resize' | 'terminal.kill'
  payload: {
    sessionId?: string
    data?: string
    cols?: number
    rows?: number
    workdir?: string
  }
}

interface TerminalSubscription {
  ws: WebSocket
  sessionId: string
  /** Until the history is sent: anything printed meanwhile is part of it. */
  replaying: boolean
}

// Lets a client that subscribes before its view exists mount that view first
const REPLAY_DELAY_MS = 100

const subscriptions = new Set<TerminalSubscription>()

let outputHandlerRegistered = false
let exitHandlerRegistered = false

function registerOutputHandler(): void {
  if (outputHandlerRegistered) return
  outputHandlerRegistered = true

  terminalManager.onOutput((output) => {
    const subs = Array.from(subscriptions).filter(
      (s) => s.sessionId === output.sessionId && !s.replaying && s.ws.readyState === WebSocket.OPEN,
    )
    for (const sub of subs) {
      sub.ws.send(
        JSON.stringify({
          type: 'terminal.output',
          payload: { sessionId: output.sessionId, data: output.data },
        }),
      )
    }
  })
}

function registerExitHandler(): void {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true

  terminalManager.onExit((sessionId, exitCode) => {
    const subs = Array.from(subscriptions).filter(
      (s) => s.sessionId === sessionId && s.ws.readyState === WebSocket.OPEN,
    )
    for (const sub of subs) {
      sub.ws.send(
        JSON.stringify({
          type: 'terminal.exit',
          payload: { sessionId, exitCode },
        }),
      )
    }
    for (const sub of subscriptions) {
      if (sub.sessionId === sessionId) {
        subscriptions.delete(sub)
      }
    }
  })
}

export function handleTerminalMessage(ws: WebSocket, message: TerminalMessage): void {
  switch (message.type) {
    case 'terminal.subscribe': {
      if (message.payload.sessionId) {
        const sessionId = message.payload.sessionId
        let subscription = Array.from(subscriptions).find((sub) => sub.ws === ws && sub.sessionId === sessionId)
        if (!subscription) {
          subscription = { ws, sessionId, replaying: false }
          subscriptions.add(subscription)
        }
        registerOutputHandler()
        registerExitHandler()

        if (!subscription.replaying) {
          const current = subscription
          current.replaying = true
          setTimeout(() => {
            current.replaying = false
            const history = terminalManager.getOutputHistory(sessionId)
            if (history && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'terminal.output', payload: { sessionId, data: history } }))
            }
          }, REPLAY_DELAY_MS)
        }
      }
      break
    }
    case 'terminal.write': {
      if (message.payload.sessionId && message.payload.data) {
        terminalManager.write(message.payload.sessionId, message.payload.data)
      }
      break
    }
    case 'terminal.resize': {
      if (
        message.payload.sessionId &&
        typeof message.payload.cols === 'number' &&
        typeof message.payload.rows === 'number'
      ) {
        terminalManager.resize(message.payload.sessionId, message.payload.cols, message.payload.rows)
      }
      break
    }
    case 'terminal.kill': {
      if (message.payload.sessionId) {
        terminalManager.kill(message.payload.sessionId)

        for (const sub of subscriptions) {
          if (sub.sessionId === message.payload.sessionId) {
            subscriptions.delete(sub)
          }
        }

        ws.send(
          JSON.stringify({
            type: 'terminal.killed',
            payload: { sessionId: message.payload.sessionId },
          }),
        )
      }
      break
    }
  }
}

export function subscribeToTerminal(ws: WebSocket, sessionId: string): void {
  subscriptions.add({ ws, sessionId, replaying: false })
}

export function unsubscribeFromTerminal(ws: WebSocket, sessionId: string): void {
  for (const sub of subscriptions) {
    if (sub.ws === ws && sub.sessionId === sessionId) {
      subscriptions.delete(sub)
    }
  }
}

export function unsubscribeAllFromTerminal(ws: WebSocket): void {
  for (const sub of subscriptions) {
    if (sub.ws === ws) {
      subscriptions.delete(sub)
    }
  }
}
