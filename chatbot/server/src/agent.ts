import OpenAI from 'openai'
import { Tools } from './tools'
import { ChatMessage } from './session-manager'
import * as mlflow from 'mlflow-tracing'
import { tracedOpenAI } from 'mlflow-openai'

export interface LLMToolCall {
  id: string
  name: string
  arguments: any
  result?: any
  error?: string
}

export interface LLMResponse {
  content: string
  toolCalls: LLMToolCall[]
  reasoning: string
  traceId: string
}

const SYSTEM_PROMPT = `
You are a web research assistant with access to real-time web search and content analysis tools.

Your goal is to provide comprehensive, accurate, and up-to-date information by:
1. Analyzing the user's query to understand what information they need
2. Using available tools strategically to gather relevant data
3. Continue using tools iteratively until you have enough information to provide a complete answer
4. Synthesizing findings into a clear, well-structured response

Available tools allow you to:
- Search the web for current information
- Fetch and analyze web page content
- Extract key insights and topics

IMPORTANT: Use tools iteratively! After getting results from one tool, analyze if you need more information and use additional tools as needed. Don't stop after just one tool call - continue researching until you can provide a comprehensive answer.

FORMATTING REQUIREMENTS:
- For simple responses (greetings, short answers, single facts): Use plain text without markdown formatting
- For detailed research responses with multiple points: Use proper Markdown syntax including:
  - Headers (## for main sections, ### for subsections) to organize information
  - Bullet points (-) or numbered lists (1.) for key findings
  - **bold** for important terms and *italic* for emphasis
  - \`inline code\` for technical terms, URLs, or specific values
  - Code blocks with \`\`\` for longer code examples or data
  - > block quotes for direct quotes from sources
  - Tables when comparing data or presenting structured information
  - Clickable links [text](URL) when referencing sources

Use markdown formatting only when it improves readability and organization. Always explain your reasoning and cite your sources. Be thorough but well-organized.
`

export class OpenAIAgent {
  private openai: OpenAI
  private tools: Tools

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    // Wrap the OpenAI client with MLflow tracing. All LLM invocations will be traced.
    this.openai = tracedOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
    this.tools = new Tools()
  }

  async run(
    query: string,
    chatHistory: ChatMessage[],
    onToolCall: (toolCall: LLMToolCall) => void
  ): Promise<LLMResponse> {
    return mlflow.withSpan(
      async (span: mlflow.LiveSpan) => {
        const tools = this.getAvailableTools()
        const toolCalls: LLMToolCall[] = []

        // Build messages with chat history
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
        ]

        // Add chat history
        for (const historyMessage of chatHistory) {
          messages.push({
            role: historyMessage.role,
            content: historyMessage.content,
          })
        }

        // Add current user query
        messages.push({ role: 'user', content: query })

        const maxIterations = 5 // Prevent infinite loops
        let iteration = 0

        while (iteration < maxIterations) {
          iteration++

          const response = await this.makeOpenAICall(messages, tools)
          const shouldContinue = await this.processResponse(
            response,
            messages,
            toolCalls,
            onToolCall
          )
          if (!shouldContinue) {
            const finalContent = response.choices[0]?.message?.content || ''
            return {
              content: finalContent,
              toolCalls,
              reasoning: `OpenAI completed research using ${toolCalls.length} tool(s) across ${iteration} iteration(s) to provide a comprehensive response.`,
              traceId: span.traceId,
            }
          }
        }

        // If we hit max iterations, get a final response
        const finalResponse = await this.openai.chat.completions.create({
          model: 'gpt-4-1106-preview',
          messages: [
            ...messages,
            {
              role: 'user',
              content: `Based on all the research you've conducted, provide a comprehensive final response to the user's query. 

    Include:
    - Key findings from your research
    - Source citations where appropriate
    - A clear summary that directly addresses the user's question

    Be thorough but well-organized.`,
            },
          ],
        })

        const finalContent = finalResponse.choices[0]?.message?.content || ''
        return {
          content: finalContent,
          toolCalls,
          reasoning: `OpenAI completed research using ${toolCalls.length} tool(s) across ${maxIterations} iterations to provide a comprehensive response.`,
          traceId: span.traceId,
        }
      },
      {
        name: 'ReActAgent',
        spanType: mlflow.SpanType.AGENT,
        inputs: { query },
      }
    )
  }

  private async executeToolCall(toolCall: LLMToolCall): Promise<any> {
    switch (toolCall.name) {
      case 'search_web':
        return await this.tools.searchWeb(toolCall.arguments.query)
      case 'fetch_web_content':
        return await this.tools.fetchWebContent(toolCall.arguments.url)
      default:
        throw new Error(`Unknown tool: ${toolCall.name}`)
    }
  }

  private getAvailableTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_web',
          description:
            "Search the web for information on a given topic. Use this to find current information, news, articles, or any web-based content related to the user's query.",
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The search query to find relevant information. Be specific and use keywords that will yield the best results.',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'fetch_web_content',
          description:
            'Fetch and extract content from a specific web page URL. Use this to get detailed content from web pages found in search results.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description:
                  'The URL of the web page to fetch content from. Must be a valid HTTP/HTTPS URL.',
              },
            },
            required: ['url'],
          },
        },
      },
    ]
  }

  private async makeOpenAICall(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const response = await this.openai.chat.completions.create({
      model: 'o4-mini',
      messages,
      tools,
    })

    const choice = response.choices[0]
    if (!choice.message) {
      throw new Error('No message in OpenAI response')
    }

    return response
  }

  private async processResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    toolCalls: LLMToolCall[],
    onToolCall: (toolCall: LLMToolCall) => void
  ): Promise<boolean> {
    const choice = response.choices[0]
    if (!choice.message) {
      throw new Error('No message in OpenAI response')
    }

    // Add assistant's response to conversation
    messages.push(choice.message)

    // Check if OpenAI wants to use tools
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      await this.executeToolCalls(choice.message.tool_calls, messages, toolCalls, onToolCall)
      return true // Continue iteration
    }

    return false // Stop iteration
  }

  private async executeToolCalls(
    openaiToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    toolCalls: LLMToolCall[],
    onToolCall: (toolCall: LLMToolCall) => void
  ): Promise<void> {
    for (const toolCall of openaiToolCalls) {
      const mcpToolCall: LLMToolCall = {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
      }

      onToolCall(mcpToolCall)

      try {
        const result = await mlflow.withSpan(() => this.executeToolCall(mcpToolCall), {
          name: toolCall.function.name,
          spanType: mlflow.SpanType.TOOL,
          inputs: { toolCall },
        })

        mcpToolCall.result = result

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          content: JSON.stringify(result, null, 2),
          tool_call_id: toolCall.id,
        })

        toolCalls.push(mcpToolCall)
      } catch (error) {
        mcpToolCall.error = error instanceof Error ? error.message : 'Unknown error'
        // Add error result to conversation
        messages.push({
          role: 'tool',
          content: `Error: ${mcpToolCall.error}`,
          tool_call_id: toolCall.id,
        })

        toolCalls.push(mcpToolCall)
      }
    }
  }
}
