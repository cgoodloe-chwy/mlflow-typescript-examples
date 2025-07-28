export interface SearchResult {
  title: string
  url: string
  snippet: string
  score: number
}

export interface WebContent {
  url: string
  title: string
  content: string
  extractedText: string
  metadata: {
    author?: string
    publishDate?: Date
    wordCount: number
  }
}

export interface TavilySearchResponse {
  query: string
  answer?: string
  results: Array<{
    title: string
    url: string
    content: string
    score: number
    published_date?: string
  }>
  response_time: number
}

export class Tools {
  private tavilyApiKey: string

  constructor() {
    this.tavilyApiKey = process.env.TAVILY_API_KEY || ''
    if (!this.tavilyApiKey) {
      throw new Error('TAVILY_API_KEY environment variable is required')
    }
  }

  async searchWeb(query: string): Promise<SearchResult[]> {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.tavilyApiKey}`,
        },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: 10,
          include_answer: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as TavilySearchResponse

      return data.results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.content,
        score: result.score,
      }))
    } catch (error) {
      console.error('Search failed:', error)
      throw new Error(
        `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async fetchWebContent(url: string): Promise<WebContent> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WebResearchBot/1.0)',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const extractedText = this.extractTextFromHTML(html)
      const title = this.extractTitle(html)

      return {
        url,
        title,
        content: html,
        extractedText,
        metadata: {
          wordCount: extractedText.split(/\s+/).length,
        },
      }
    } catch (error) {
      console.error('Fetch failed:', error)
      throw new Error(
        `Failed to fetch content from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private extractTextFromHTML(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ')

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim()
    // Limit length to avoid excessive content
    return text.length > 10000 ? text.substring(0, 10000) + '...' : text
  }

  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return titleMatch ? titleMatch[1].trim() : 'Untitled Page'
  }
}
