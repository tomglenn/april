export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
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
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'AprilAgent/1.0 (personal AI assistant)' }
  })

  if (!res.ok) throw new Error(`Search request failed: ${res.status}`)

  const data = (await res.json()) as {
    Abstract: string
    AbstractURL: string
    AbstractSource: string
    Answer: string
    RelatedTopics: Array<{
      Text?: string
      FirstURL?: string
      Topics?: Array<{ Text?: string; FirstURL?: string }>
    }>
    Results: Array<{ Text?: string; FirstURL?: string }>
  }

  const parts: string[] = []

  if (data.Answer) {
    parts.push(`Answer: ${data.Answer}`, '')
  }

  if (data.Abstract) {
    parts.push(`Summary (${data.AbstractSource}): ${data.Abstract}`)
    if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`)
    parts.push('')
  }

  const results: string[] = []
  for (const r of data.Results ?? []) {
    if (r.Text && r.FirstURL) results.push(`• ${r.Text}\n  ${r.FirstURL}`)
  }
  for (const t of data.RelatedTopics ?? []) {
    if (results.length >= 8) break
    if (t.Text && t.FirstURL) {
      results.push(`• ${t.Text}\n  ${t.FirstURL}`)
    } else if (t.Topics) {
      for (const st of t.Topics) {
        if (results.length >= 8) break
        if (st.Text && st.FirstURL) results.push(`• ${st.Text}\n  ${st.FirstURL}`)
      }
    }
  }

  if (results.length > 0) {
    parts.push('Results:')
    parts.push(...results)
  }

  if (parts.length === 0) {
    return (
      `No instant results found for "${query}". ` +
      `Try browse_url with a specific site, e.g. browse_url("https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}")`
    )
  }

  return parts.join('\n')
}

async function browseUrl(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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

// ── Executor ─────────────────────────────────────────────────────────────────

export async function executeTool(name: string, input: unknown): Promise<string> {
  const inp = input as Record<string, string>
  try {
    switch (name) {
      case 'web_search':
        return await webSearch(inp.query)
      case 'browse_url':
        return await browseUrl(inp.url)
      case 'get_weather':
        return await getWeather(inp.location)
      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`
  }
}
