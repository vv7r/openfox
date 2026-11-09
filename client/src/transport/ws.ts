import type { ClientMessageType, ServerMessage } from '@shared/protocol.js'
import { isServerMessage } from '@shared/protocol.js'

export type ConnectionStatus = 'connected' | 'disconnected'

const MAX_BACKOFF_MS = 15_000

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('openfox_token')
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

  send(type: ClientMessageType, payload: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ id: crypto.randomUUID(), type, payload }))
  }
}
