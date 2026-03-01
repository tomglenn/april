# April

A personal AI assistant for your desktop. Chat with Claude, GPT, or local models via Ollama — with built-in tools for web search, browsing, weather, and image generation.

![April](resources/banner.jpg)

## Features

- **Multiple AI providers** — Anthropic (Claude), OpenAI (GPT), or any local model via Ollama
- **Streaming responses** with real-time output
- **Global hotkey overlay** — summon a quick-prompt window from anywhere, then open the conversation in the full app
- **Built-in tools** the AI can use autonomously:
  - Web search (DuckDuckGo)
  - Browse any URL
  - Weather forecasts (current + 4-day)
  - Image generation via GPT-Image-1 (requires OpenAI key)
  - Reminders — "remind me in 30 minutes to check the oven" (optional [ntfy.sh](https://ntfy.sh) push notifications)
- **MCP server support** — connect any [Model Context Protocol](https://modelcontextprotocol.io) server via the built-in catalog or add your own. Catalog includes:
  - **Filesystem** — read, write, and search files on your computer
  - **Memory** — persistent key-value memory across conversations
  - **GitHub** — search repos, manage issues and PRs
  - **Brave Search** — higher-quality web search (upgrade over built-in DuckDuckGo)
  - **SQLite** — query and modify local databases with natural language
- **Extended thinking** support for Claude models
- **Activity log** — see tool calls and MCP actions as they happen
- **Conversation history** with auto-generated titles
- **First-run setup wizard** for quick onboarding
- **Personalisation** — set a name and communication style the AI adapts to
- **Background mode** — runs in the system tray so reminders fire even when the window is closed
- **Dark/light/system theme**
- **Your data stays on-device** — API keys and conversation history are stored locally; only your messages are sent to whichever AI provider you choose

## Stack

| Layer | Technology |
|---|---|
| Shell | Electron 34 |
| Renderer | React 18 + TypeScript |
| Styling | Tailwind CSS v3 |
| State | Zustand |
| Storage | electron-store v8 |
| Build | electron-vite + electron-builder |
| AI | @anthropic-ai/sdk, openai |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Type check

```bash
npm run typecheck
```

## Building

Build for your current platform:

```bash
npm run build        # compile only (no installer)
npm run build:mac    # macOS .dmg
npm run build:win    # Windows installer
npm run build:linux  # Linux AppImage/deb
```

Output goes to `dist/`.

### macOS: build and install in one step

```bash
npm run deploy:mac
```

This builds the app, quits any running instance, and installs it to `/Applications/April.app`.

## Configuration

On first launch, a setup wizard walks you through:

1. Choosing a provider and entering your API key
2. Optionally adding an OpenAI key for image generation
3. Picking a communication style (personality)

Settings can be changed at any time via the gear icon. API keys and conversations are stored locally at:

```
~/Library/Application Support/april-agent/   # macOS
%APPDATA%\april-agent\                        # Windows
~/.config/april-agent/                        # Linux
```

### Supported models

| Provider | Notes |
|---|---|
| **Anthropic** | Claude Sonnet, Opus, Haiku — set key in Settings |
| **OpenAI** | GPT-4o, o1, o3-mini, etc. — set key in Settings |
| **Ollama** | Any locally running model — configure base URL (default `http://localhost:11434`) |

Image generation always uses OpenAI's GPT-Image-1 regardless of the active chat provider. The tool is hidden from the model if no OpenAI key is configured.
