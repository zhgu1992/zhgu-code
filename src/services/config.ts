import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface ClaudeConfig {
  model?: string
  env?: Record<string, string>
}

let cachedConfig: ClaudeConfig | null = null

/**
 * Load config from ~/.claude/settings.json
 */
export function loadConfig(): ClaudeConfig {
  if (cachedConfig) return cachedConfig

  const configPath = path.join(os.homedir(), '.claude', 'settings.json')

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      cachedConfig = JSON.parse(content)
      return cachedConfig || {}
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }

  return {}
}

/**
 * Get API configuration from config file
 */
export function getAPIConfig(): {
  baseURL?: string
  apiKey?: string
  model: string
  customHeaders?: Record<string, string>
} {
  const config = loadConfig()
  const env = config.env || {}

  // Parse custom headers from config or env
  const customHeadersStr = env.ANTHROPIC_CUSTOM_HEADERS || process.env.ANTHROPIC_CUSTOM_HEADERS
  const customHeaders: Record<string, string> = {}
  if (customHeadersStr) {
    const lines = customHeadersStr.split(/\n|\r\n/)
    for (const line of lines) {
      if (!line.trim()) continue
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const name = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        if (name && value) {
          customHeaders[name] = value
        }
      }
    }
  }

  return {
    baseURL: env.ANTHROPIC_BASE_URL || env.ANTHROPIC_FOUNDRY_BASE_URL,
    apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_FOUNDRY_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL || config.model || 'claude-sonnet-4-20250514',
    customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
  }
}
