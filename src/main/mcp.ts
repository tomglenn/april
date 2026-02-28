import { spawn, ChildProcess } from 'child_process'
import type { MCPServerConfig } from '../renderer/src/types'
import type { ToolDefinition } from './tools'

interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number | null
  result?: unknown
  error?: { code: number; message: string }
}

class MCPClient {
  private proc: ChildProcess | null = null
  private buffer = ''
  private stderrBuffer = ''
  private nextId = 1
  private pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>()
  public tools: MCPTool[] = []
  public connected = false
  public error: string | null = null

  constructor(public readonly config: MCPServerConfig) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false

      try {
        this.proc = spawn(this.config.command, this.config.args, {
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        })
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
        reject(err)
        return
      }

      this.proc.on('error', (err) => {
        this.error = err.message
        this.connected = false
        this.rejectAll(new Error(`MCP process error: ${err.message}`))
        if (!resolved) { resolved = true; reject(err) }
      })

      this.proc.on('exit', (code) => {
        this.connected = false
        const stderr = this.stderrBuffer.trim()
        if (code !== 0 && code !== null) {
          this.error = stderr ? `Exited with code ${code}: ${stderr.slice(-200)}` : `Exited with code ${code}`
        }
        this.rejectAll(new Error(this.error ?? 'MCP process exited'))
      })

      this.proc.stdout?.setEncoding('utf8')
      this.proc.stdout?.on('data', (chunk: string) => {
        this.buffer += chunk
        this.processBuffer()
      })

      this.proc.stderr?.setEncoding('utf8')
      this.proc.stderr?.on('data', (chunk: string) => {
        this.stderrBuffer += chunk
        console.error(`[MCP ${this.config.name}]`, chunk.trimEnd())
      })

      this.proc.stdin?.on('error', (err) => {
        this.rejectAll(new Error(`MCP stdin error: ${err.message}`))
      })

      this.initialize()
        .then(() => this.fetchTools())
        .then(() => {
          resolved = true
          this.connected = true
          this.error = null
          resolve()
        })
        .catch((err: Error) => {
          this.error = err.message
          if (!resolved) { resolved = true; reject(err) }
        })
    })
  }

  private rejectAll(err: Error): void {
    for (const [, h] of this.pending) h.reject(err)
    this.pending.clear()
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse
        if (msg.id != null) {
          const handler = this.pending.get(msg.id as number)
          if (handler) {
            this.pending.delete(msg.id as number)
            if (msg.error) handler.reject(new Error(msg.error.message))
            else handler.resolve(msg.result)
          }
        }
        // Ignore notifications (no id)
      } catch { /* ignore malformed lines */ }
    }
  }

  private write(msg: object): void {
    this.proc?.stdin?.write(JSON.stringify(msg) + '\n')
  }

  private request<T>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject })
      this.write({ jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          const stderr = this.stderrBuffer.trim()
          const detail = stderr ? ` (stderr: ${stderr.slice(-300)})` : ''
          reject(new Error(`MCP timeout: ${method}${detail}`))
        }
      }, 30000)
    })
  }

  private async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'april', version: '1.0.0' }
    })
    this.write({ jsonrpc: '2.0', method: 'notifications/initialized' })
  }

  private async fetchTools(): Promise<void> {
    const result = await this.request<{ tools?: MCPTool[] }>('tools/list', {})
    this.tools = result.tools ?? []
  }

  async callTool(toolName: string, args: unknown): Promise<string> {
    const result = await this.request<{
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }>('tools/call', { name: toolName, arguments: args })
    if (!result.content?.length) return ''
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n')
  }

  disconnect(): void {
    try { this.proc?.kill() } catch { /* ignore */ }
    this.proc = null
    this.connected = false
    this.tools = []
    this.pending.clear()
  }
}

export interface MCPServerStatus {
  name: string
  connected: boolean
  toolCount: number
  error: string | null
}

class MCPManager {
  private clients = new Map<string, MCPClient>()

  async syncServers(configs: MCPServerConfig[]): Promise<void> {
    const enabledNames = new Set(configs.filter((c) => c.enabled).map((c) => c.name))

    // Stop removed or disabled servers
    for (const [name, client] of this.clients) {
      if (!enabledNames.has(name)) {
        client.disconnect()
        this.clients.delete(name)
      }
    }

    // Start new or reconnect changed servers
    for (const config of configs) {
      if (!config.enabled) continue
      const existing = this.clients.get(config.name)
      const sig = `${config.command}|${config.args.join(' ')}`
      const existingSig = existing ? `${existing.config.command}|${existing.config.args.join(' ')}` : null
      if (!existing?.connected || sig !== existingSig) {
        existing?.disconnect()
        const client = new MCPClient(config)
        this.clients.set(config.name, client)
        client.connect().catch((err) => {
          console.error(`MCP server "${config.name}" failed to connect:`, err.message)
        })
      }
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    for (const [serverName, client] of this.clients) {
      if (!client.connected) continue
      for (const tool of client.tools) {
        defs.push({
          name: `mcp__${serverName}__${tool.name}`,
          description: `[${serverName}] ${tool.description ?? tool.name}`,
          input_schema: (tool.inputSchema ?? { type: 'object', properties: {}, required: [] }) as ToolDefinition['input_schema']
        })
      }
    }
    return defs
  }

  async callTool(toolKey: string, args: unknown): Promise<string> {
    // toolKey format: "mcp__<serverName>__<toolName>"
    const match = toolKey.match(/^mcp__(.+?)__(.+)$/)
    if (!match) return `Invalid MCP tool key: ${toolKey}`
    const [, serverName, toolName] = match
    const client = this.clients.get(serverName)
    if (!client?.connected) return `MCP server "${serverName}" is not connected`
    return client.callTool(toolName, args)
  }

  stopAll(): void {
    for (const client of this.clients.values()) client.disconnect()
    this.clients.clear()
  }

  getStatus(): MCPServerStatus[] {
    return Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      connected: client.connected,
      toolCount: client.tools.length,
      error: client.error
    }))
  }
}

export const mcpManager = new MCPManager()
