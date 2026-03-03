import OpenAI from 'openai'
import { getPlatform } from './platform'
import { mcpManager } from './mcp'

export type ToolResult =
  | { type: 'text'; content: string }
  | { type: 'image'; mediaType: string; data: string }

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      'Search the web for current information, news, facts, or anything that may have changed after your training cutoff. Returns a summary and top results with URLs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'browse_url',
    description:
      'Fetch and read the text content of any web page. Use this to read articles, documentation, or follow up on a search result URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to fetch (must start with http:// or https://)' }
      },
      required: ['url']
    }
  },
  {
    name: 'get_weather',
    description: 'Get the current weather conditions and 4-day forecast for any location.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or location, e.g. "London", "Tokyo", "New York"'
        }
      },
      required: ['location']
    }
  },
  {
    name: 'generate_image',
    description:
      "Generate an image using GPT-Image-1, OpenAI's most capable image model (the same one powering ChatGPT). Supports transparent backgrounds, high-quality rendering, and follows detailed prompts closely. Use this when the user asks to create, draw, generate, or visualise an image.",
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image to generate'
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536'],
          description:
            'Image dimensions: 1536x1024 for landscape, 1024x1536 for portrait, 1024x1024 for square (default)'
        },
        quality: {
          type: 'string',
          enum: ['auto', 'high', 'medium', 'low'],
          description:
            'Rendering quality. Use "high" for detailed or hero images; "low" for quick previews. Defaults to "auto".'
        },
        transparent: {
          type: 'boolean',
          description:
            'Set true to produce a PNG with a transparent background — ideal for logos, stickers, icons, or assets that will be composited onto other content.'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'schedule_reminder',
    description:
      'Schedule a reminder notification that will appear after the specified delay. Use when the user asks to be reminded about something.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The reminder message to display' },
        delay_minutes: {
          type: 'number',
          description: 'Number of minutes from now until the reminder fires'
        }
      },
      required: ['message', 'delay_minutes']
    }
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        reminder_id: { type: 'string', description: 'The ID of the reminder to cancel' }
      },
      required: ['reminder_id']
    }
  },
  {
    name: 'save_memory',
    description:
      'Save a memory about the user for future conversations. Store atomic facts — one concept per memory.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact or preference to remember' }
      },
      required: ['content']
    }
  },
  {
    name: 'delete_memory',
    description: 'Delete a previously saved memory by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the memory to delete' }
      },
      required: ['id']
    }
  }
]

// ── HTML stripping ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Fetch with timeout ───────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// ── Tools ────────────────────────────────────────────────────────────────────

async function webSearch(query: string): Promise<string> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`
  const res = await fetchWithTimeout(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  })

  if (!res.ok) throw new Error(`Search request failed: ${res.status}`)

  const html = await res.text()

  const titleRe = /class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g

  const links: Array<{ href: string; title: string }> = []
  const snippets: string[] = []

  let m: RegExpExecArray | null
  while ((m = titleRe.exec(html)) !== null) {
    const title = stripHtml(m[2]).trim()
    if (title) links.push({ href: m[1], title })
  }
  while ((m = snippetRe.exec(html)) !== null) {
    const s = stripHtml(m[1]).trim()
    if (s) snippets.push(s)
  }

  const results: Array<{ title: string; url: string; snippet: string }> = []
  for (let i = 0; i < links.length && results.length < 8; i++) {
    const { href, title } = links[i]
    let url = href
    const uddg = href.match(/[?&]uddg=([^&]+)/)
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]) } catch { /* keep raw */ }
    }
    if (!url || url.startsWith('//') || url.includes('duckduckgo.com')) continue
    results.push({ title, url, snippet: snippets[i] ?? '' })
  }

  if (results.length === 0) {
    return `No results found for "${query}". Try browse_url with a specific URL.`
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join('\n\n')
}

async function browseUrl(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    }
  })

  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const text = await res.text()
    return text.slice(0, 6000)
  }

  const html = await res.text()
  const text = stripHtml(html)
  const truncated = text.slice(0, 6000)
  return truncated + (text.length > 6000 ? '\n\n[Content truncated to 6000 characters]' : '')
}

const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers',
  81: 'Moderate showers',
  82: 'Violent showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + hail',
  99: 'Thunderstorm + heavy hail'
}

async function getWeather(location: string): Promise<string> {
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
  )
  const geoData = (await geoRes.json()) as {
    results?: Array<{
      name: string
      country: string
      admin1?: string
      latitude: number
      longitude: number
      timezone: string
    }>
  }

  if (!geoData.results?.length) {
    return `Could not find location: "${location}". Try a more specific city name.`
  }

  const { name, country, admin1, latitude, longitude, timezone } = geoData.results[0]
  const locationLabel = [name, admin1, country].filter(Boolean).join(', ')

  const weatherRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&timezone=${encodeURIComponent(timezone)}&forecast_days=4&wind_speed_unit=mph`
  )
  const w = (await weatherRes.json()) as {
    current: {
      time: string
      temperature_2m: number
      apparent_temperature: number
      weather_code: number
      wind_speed_10m: number
      relative_humidity_2m: number
      precipitation: number
    }
    daily: {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_sum: number[]
      wind_speed_10m_max: number[]
    }
  }

  const c = w.current
  const d = w.daily
  const cond = WMO[c.weather_code] ?? 'Unknown'

  const dayNames = ['Today', 'Tomorrow']
  const lines = [
    `📍 ${locationLabel}`,
    ``,
    `Current conditions (${c.time}):`,
    `  ${cond}`,
    `  🌡  ${c.temperature_2m}°C  (feels like ${c.apparent_temperature}°C)`,
    `  💧 Humidity: ${c.relative_humidity_2m}%`,
    `  💨 Wind: ${c.wind_speed_10m} mph`,
    c.precipitation > 0 ? `  🌧  Precipitation: ${c.precipitation}mm` : '',
    ``,
    `Forecast:`
  ].filter((l) => l !== null) as string[]

  for (let i = 0; i < d.time.length; i++) {
    const label = dayNames[i] ?? d.time[i]
    const dayCond = WMO[d.weather_code[i]] ?? 'Unknown'
    lines.push(
      `  ${label}: ${dayCond}, ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C` +
        (d.precipitation_sum[i] > 0 ? `, ${d.precipitation_sum[i]}mm rain` : '')
    )
  }

  return lines.join('\n')
}

// ── Image generation ──────────────────────────────────────────────────────────

async function generateImage(input: unknown, openaiApiKey: string): Promise<ToolResult> {
  const {
    prompt,
    size = '1024x1024',
    quality = 'auto',
    transparent = false
  } = input as { prompt: string; size?: string; quality?: string; transparent?: boolean }

  if (!openaiApiKey) {
    return { type: 'text', content: 'Tool error: An OpenAI API key is required for image generation. Please add yours in Settings.' }
  }

  const openai = new OpenAI({ apiKey: openaiApiKey })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.images.generate as (p: any) => Promise<{ data?: Array<{ b64_json?: string }> }>)({
    model: 'gpt-image-1',
    prompt,
    n: 1,
    size,
    quality,
    background: transparent ? 'transparent' : 'auto',
    output_format: 'png'
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) return { type: 'text', content: 'Tool error: No image data returned.' }
  return { type: 'image', mediaType: 'image/png', data: b64 }
}

// ── Reminder tools ────────────────────────────────────────────────────────

async function scheduleReminderTool(input: unknown): Promise<string> {
  const { addReminder } = await import('./reminders')
  const { message, delay_minutes } = input as { message: string; delay_minutes: number }
  const reminder = addReminder(message, delay_minutes)
  const fireDate = new Date(reminder.fireAt)
  const timeStr = fireDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `Reminder set for ${timeStr}: ${message}`
}

async function cancelReminderTool(input: unknown): Promise<string> {
  const { cancelReminder } = await import('./reminders')
  const { reminder_id } = input as { reminder_id: string }
  const ok = cancelReminder(reminder_id)
  return ok ? 'Reminder cancelled.' : 'Reminder not found.'
}

// ── Memory tools ──────────────────────────────────────────────────────────

function saveMemoryTool(input: unknown): string {
  const platform = getPlatform()
  const { content } = input as { content: string }
  const synced = platform.storage.readSyncedSettings()
  const memory = { id: crypto.randomUUID(), content, createdAt: Date.now() }
  platform.storage.writeSyncedSettings({ memories: [...(synced.memories ?? []), memory] })
  platform.notifications.broadcastEvent('sync:changed')
  return `Memory saved: "${content}"`
}

function deleteMemoryTool(input: unknown): string {
  const platform = getPlatform()
  const { id } = input as { id: string }
  const synced = platform.storage.readSyncedSettings()
  const before = (synced.memories ?? []).length
  const filtered = (synced.memories ?? []).filter((m) => m.id !== id)
  if (filtered.length === before) return 'Memory not found.'
  platform.storage.writeSyncedSettings({ memories: filtered })
  platform.notifications.broadcastEvent('sync:changed')
  return 'Memory deleted.'
}

// ── Executor ─────────────────────────────────────────────────────────────────

export async function executeTool(name: string, input: unknown, openaiApiKey?: string): Promise<ToolResult> {
  // MCP tools are namespaced as "mcp__<serverName>__<toolName>"
  if (name.startsWith('mcp__')) {
    try {
      return { type: 'text', content: await mcpManager.callTool(name, input) }
    } catch (err) {
      return { type: 'text', content: `Tool error: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  const inp = input as Record<string, string>
  try {
    switch (name) {
      case 'web_search':
        return { type: 'text', content: await webSearch(inp.query) }
      case 'browse_url':
        return { type: 'text', content: await browseUrl(inp.url) }
      case 'get_weather':
        return { type: 'text', content: await getWeather(inp.location) }
      case 'generate_image':
        return generateImage(input, openaiApiKey ?? '')
      case 'schedule_reminder':
        return { type: 'text', content: await scheduleReminderTool(input) }
      case 'cancel_reminder':
        return { type: 'text', content: await cancelReminderTool(input) }
      case 'save_memory':
        return { type: 'text', content: saveMemoryTool(input) }
      case 'delete_memory':
        return { type: 'text', content: deleteMemoryTool(input) }
      default:
        return { type: 'text', content: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { type: 'text', content: `Tool error: ${err instanceof Error ? err.message : String(err)}` }
  }
}
