// Browser-safe exports — no Node.js dependencies
// Used by the renderer process which can't access Node APIs

export * from './types'
export { DEFAULT_SYSTEM_PROMPT, ANTHROPIC_MODELS, OPENAI_MODELS, SYNCED_DEFAULTS, LOCAL_DEFAULTS } from './constants'
export { MCP_CATALOG, buildServerConfig } from './data/mcpCatalog'
export type { MCPCatalogEntry, CatalogParam } from './data/mcpCatalog'
export type { SendMessagePayload, ChunkData } from './chat'
export type { MCPServerStatus } from './mcp'
export type { ToolDefinition, ToolResult } from './tools'
