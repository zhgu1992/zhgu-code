import type { Tool } from '../definitions/types/index.js'

interface WebFetchInput {
  url: string
  prompt: string
}

export const WebFetchTool: Tool<WebFetchInput, string> = {
  name: 'WebFetch',
  description: `Fetch content from a URL and process it with a prompt.
Returns the processed content.
IMPORTANT: This will fail for authenticated or private URLs.
Use this to retrieve web pages, API responses, or other public content.`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from',
      },
      prompt: {
        type: 'string',
        description: 'The prompt describing what to extract or how to process the content',
      },
    },
    required: ['url', 'prompt'],
  },

  async execute(input: WebFetchInput) {
    const { url, prompt } = input

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return `Error: Invalid URL "${url}"`
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return `Error: Only http and https URLs are supported`
    }

    // Upgrade http to https
    if (parsedUrl.protocol === 'http:') {
      parsedUrl.protocol = 'https:'
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'zhgu-code/0.1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
        },
        // Allow invalid certificates for development
        // @ts-ignore - Bun specific option
        tls: {
          rejectUnauthorized: false,
        },
      })

      clearTimeout(timeout)

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`
      }

      const contentType = response.headers.get('content-type') || ''
      let content = await response.text()

      // Simple HTML to text conversion
      if (contentType.includes('text/html')) {
        content = htmlToText(content)
      }

      // Truncate if too long
      const maxLength = 50000
      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n\n[Content truncated due to length...]'
      }

      // Return content with prompt context
      return `Fetched from ${url} (status: ${response.status}, type: ${contentType})\n\nContent:\n${content}\n\nPrompt: ${prompt}`
    } catch (error) {
      // Handle specific errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return `Error: Request timeout after 30 seconds`
        }
        return `Error fetching URL: ${error.message}`
      }
      return `Error fetching URL: ${String(error)}`
    }
  },
}

function htmlToText(html: string): string {
  // Simple HTML to text conversion
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')

  // Convert common block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Clean up whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}
