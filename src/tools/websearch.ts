import type { Tool } from '../definitions/types/index.js'

interface WebSearchInput {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export const WebSearchTool: Tool<WebSearchInput, string> = {
  name: 'WebSearch',
  description: `Search the web for information. Returns search results with titles, URLs, and snippets.
IMPORTANT: You MUST include a "Sources:" section at the end of your response with markdown hyperlinks.
Use this when you need current information beyond your knowledge cutoff.`,
  safeToRetry: true,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      allowed_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only include results from these domains',
      },
      blocked_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exclude results from these domains',
      },
    },
    required: ['query'],
  },

  async execute(input: WebSearchInput) {
    const { query, allowed_domains, blocked_domains } = input

    if (!query || query.length < 2) {
      return 'Error: Search query must be at least 2 characters'
    }

    if (allowed_domains?.length && blocked_domains?.length) {
      return 'Error: Cannot specify both allowed_domains and blocked_domains'
    }

    try {
      const results = await performSearch(query)

      // Filter results if domain restrictions are specified
      let filteredResults = results
      if (allowed_domains?.length) {
        filteredResults = results.filter((r) =>
          allowed_domains.some((d) => r.url.includes(d)),
        )
      }
      if (blocked_domains?.length) {
        filteredResults = results.filter(
          (r) => !blocked_domains.some((d) => r.url.includes(d)),
        )
      }

      if (filteredResults.length === 0) {
        return `No search results found for: "${query}"\n\nNote: Web search may be unavailable due to network restrictions. Try using WebFetch with specific URLs.`
      }

      // Format output
      let output = `Web search results for: "${query}"\n\n`
      output += 'Results:\n'
      for (const result of filteredResults.slice(0, 10)) {
        output += `\n- [${result.title}](${result.url})`
        if (result.snippet) {
          output += `\n  ${result.snippet}`
        }
      }

      output +=
        '\n\nREMINDER: You MUST include the sources above in your response using markdown hyperlinks.'

      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Return fallback results
      return `Web search is currently unavailable (${message}).

Try these manual search links:
- [Google Search](https://www.google.com/search?q=${encodeURIComponent(query)})
- [Bing Search](https://www.bing.com/search?q=${encodeURIComponent(query)})
- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(query)})

Alternatively, you can use WebFetch to get content from specific URLs.`
    }
  },
}

async function performSearch(query: string): Promise<SearchResult[]> {
  // Use DuckDuckGo Instant Answer API with fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'zhgu-code/0.1.0',
          Accept: 'application/json',
        },
      },
    )

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = await response.json() as {
      Abstract?: string
      AbstractURL?: string
      Heading?: string
      RelatedTopics?: Array<{
        Topics?: Array<{ FirstURL?: string; Text?: string }>
        FirstURL?: string
        Text?: string
      }>
    }
    const results: SearchResult[] = []

    // Add abstract if available
    if (json.Abstract && json.AbstractURL) {
      results.push({
        title: json.Heading || 'Summary',
        url: json.AbstractURL,
        snippet: json.Abstract.slice(0, 200),
      })
    }

    // Add related topics
    if (json.RelatedTopics && Array.isArray(json.RelatedTopics)) {
      for (const topic of json.RelatedTopics) {
        if (results.length >= 10) break

        if (topic.Topics) {
          for (const subTopic of topic.Topics) {
            if (results.length >= 10) break
            if (subTopic.FirstURL && subTopic.Text) {
              results.push({
                title: subTopic.Text.split(' - ')[0] || 'Related',
                url: subTopic.FirstURL,
                snippet: subTopic.Text,
              })
            }
          }
        } else if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            url: topic.FirstURL,
            snippet: topic.Text,
          })
        }
      }
    }

    return results
  } finally {
    clearTimeout(timeout)
  }
}
