import type { ClientMessageType, ServerMessage } from '@shared/protocol.js'
import { isServerMessage } from '@shared/protocol.js'
import { readToken } from '../api'

export type ConnectionStatus = 'connected' | 'disconnected'

const MAX_BACKOFF_MS = 15_000

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = readToken()
  return `${protocol}//${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

export class Socket {
  private socket: WebSocket | null = null
  private attempts = 0

  constructor(
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
  ) {}

  connect(): void {
    const socket = new WebSocket(socketUrl())
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.onStatus('connected')
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      const data: unknown = JSON.parse(event.data)
      if (isServerMessage(data)) this.onMessage(data)
    }
    socket.onclose = () => {
      this.onStatus('disconnected')
      setTimeout(() => this.connect(), Math.min(250 * 2 ** this.attempts++, MAX_BACKOFF_MS))
    }
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /** The request id, or null when the socket is not open. */
  send(type: ClientMessageType, payload: unknown): string | null {
    if (!this.connected) return null
    const id = crypto.randomUUID()
    this.socket!.send(JSON.stringify({ id, type, payload }))
    return id
  }
}
