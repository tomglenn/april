import type { MCPServerConfig } from '../types'

export interface CatalogParam {
  id: string
  label: string
  placeholder: string
  type: 'text' | 'secret'
  envKey?: string
}

export interface MCPCatalogEntry {
  id: string
  name: string
  category: 'files' | 'web' | 'data' | 'dev' | 'productivity'
  description: string
  command: string
  args: string[]
  params?: CatalogParam[]
}

export const MCP_CATALOG: MCPCatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    category: 'files',
    description: 'Read, write, and search files and directories on your computer.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '{path}'],
    params: [{ id: 'path', label: 'Directory to allow access to', placeholder: '/Users/you/Documents', type: 'text' }]
  },
  {
    id: 'memory',
    name: 'Memory',
    category: 'productivity',
    description: 'Persistent key-value memory that survives across conversations.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory']
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'dev',
    description: 'Search repos, read files, manage issues and PRs via the GitHub API.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    params: [{ id: 'token', label: 'GitHub Personal Access Token', placeholder: 'ghp_...', type: 'secret', envKey: 'GITHUB_PERSONAL_ACCESS_TOKEN' }]
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    category: 'web',
    description: 'Higher-quality web search via the official Brave Search API. Upgrade over the built-in DuckDuckGo search.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    params: [{ id: 'apiKey', label: 'Brave API Key', placeholder: 'BSA...', type: 'secret', envKey: 'BRAVE_API_KEY' }]
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    category: 'data',
    description: 'Query and modify a local SQLite database with natural language.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '{dbPath}'],
    params: [{ id: 'dbPath', label: 'Path to SQLite database file', placeholder: '/Users/you/data.db', type: 'text' }]
  },
]

export function buildServerConfig(
  entry: MCPCatalogEntry,
  paramValues: Record<string, string>
): MCPServerConfig {
  const args = entry.args.map((a) =>
    a.replace(/\{(\w+)\}/g, (_, id) => paramValues[id] ?? a)
  )
  const env: Record<string, string> = {}
  for (const p of entry.params ?? []) {
    if (p.envKey && paramValues[p.id]) env[p.envKey] = paramValues[p.id]
  }
  return {
    name: entry.name,
    command: entry.command,
    args,
    ...(Object.keys(env).length ? { env } : {}),
    enabled: true
  }
}
