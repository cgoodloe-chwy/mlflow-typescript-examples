import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { OpenAIAgent, LLMToolCall } from './agent'
import { ChatSessionManager } from './session-manager'
import * as mlflow from 'mlflow-tracing'

dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
})

app.use(cors())
app.use(express.json())

console.log('🔍 OpenAI research agent ready')

/**
 * Initialize MLflow
 * */
mlflow.init({
  trackingUri: process.env.MLFLOW_TRACKING_URI!,
  experimentId: process.env.MLFLOW_EXPERIMENT_ID!,
})

// Initialize OpenAIAgent and ChatSessionManager
const openaiAgent = new OpenAIAgent()
const sessionManager = new ChatSessionManager()
console.log('OpenAI Agent initialized with direct tools')
console.log('Chat session manager initialized')

io.on('connection', socket => {
  console.log('Client connected:', socket.id)

  // Handle new chat session creation
  socket.on('start-new-chat', () => {
    const sessionId = sessionManager.createSession()
    socket.emit('chat-session-created', { sessionId })
  })

  socket.on(
    'research-query',
    // Wrap the handler with mlflow.trace to trace the query handling
    mlflow.trace(
      async data => {
        console.log('Received research query:', data.message, 'sessionId:', data.sessionId)

        try {
          // Get or create session
          let sessionId = data.sessionId
          if (!sessionId || !sessionManager.getSession(sessionId)) {
            sessionId = sessionManager.createSession()
            console.log('Created new session:', sessionId)
          }

          // Tag the session ID to the trace so that we can find the trace in MLflow easily
          mlflow.updateCurrentTrace({
            tags: { sessionId: sessionId },
          })

          // Get chat history
          const chatHistory = sessionManager.getMessages(sessionId)
          console.log(`Retrieved ${chatHistory.length} messages from session history`)

          // Process the research query with chat history
          const results = await openaiAgent.run(
            data.message,
            chatHistory,
            (toolCall: LLMToolCall) => {
              // Convert LLM tool calls to UI updates
              socket.emit('tool-update', {
                id: toolCall.id,
                name: `OpenAI → ${toolCall.name}`,
                status: 'running' as const,
                description: `OpenAI is calling ${toolCall.name} with: ${JSON.stringify(toolCall.arguments)}`,
              })

              // Update when tool completes
              setTimeout(() => {
                socket.emit('tool-update', {
                  id: toolCall.id,
                  name: `OpenAI → ${toolCall.name}`,
                  status: toolCall.error ? ('error' as const) : ('completed' as const),
                  description: `OpenAI called ${toolCall.name} with: ${JSON.stringify(toolCall.arguments)}`,
                  result: toolCall.error ? undefined : `Tool executed successfully`,
                  error: toolCall.error,
                  duration: 1000, // Approximate duration
                })
              }, 100)
            }
          )

          // Add user and assistant messages to session
          sessionManager.addMessage(sessionId, 'user', data.message)
          sessionManager.addMessage(sessionId, 'assistant', results.content)

          // Send the complete research results
          socket.emit('research-complete', {
            id: Date.now(),
            response: results.content,
            reasoning: results.reasoning,
            toolCalls: results.toolCalls.length,
            traceId: results.traceId,
            sessionId,
          })
        } catch (error) {
          console.error('Error processing research query:', error)
          socket.emit('research-error', {
            error: error instanceof Error ? error.message : 'Failed to process research query',
          })
        }
      },
      // Trace options
      {
        name: 'research-query',
        spanType: mlflow.SpanType.CHAIN,
      }
    )
  )

  // Handle feedback submissions
  socket.on('submit-feedback', async data => {
    console.log('Received feedback:', data)

    try {
      const { messageId, thumbsUp } = data

      console.log(`Feedback received: ${thumbsUp ? 'thumbs up' : 'thumbs down'}`)

      // Confirm feedback was logged
      socket.emit('feedback-logged', {
        messageId: messageId,
        success: true,
      })
    } catch (error) {
      console.error('Error logging feedback:', error)
      socket.emit('feedback-logged', {
        messageId: data.messageId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to log feedback',
      })
    }
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🔗 Socket.io server ready for connections`)
})
