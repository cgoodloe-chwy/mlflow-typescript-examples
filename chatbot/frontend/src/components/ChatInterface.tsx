import { useState, useRef, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { Search } from 'lucide-react'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import ToolExecutionPanel from './ToolExecutionPanel'

export interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  traceId?: string
  feedbackStatus?: 'idle' | 'submitting' | 'submitted' | 'error'
}

export interface ToolExecution {
  id: string
  name: string
  status: 'running' | 'completed' | 'error'
  duration?: number
  description: string
  result?: string
  error?: string
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:3001')

    // Set up event listeners
    socketRef.current.on('tool-update', (update: ToolExecution) => {
      setToolExecutions(prev => {
        const existing = prev.find(t => t.id === update.id)
        if (existing) {
          return prev.map(t => (t.id === update.id ? update : t))
        }
        return [...prev, update]
      })
    })

    socketRef.current.on('chat-session-created', (data: { sessionId: string }) => {
      setSessionId(data.sessionId)
      console.log('New chat session created:', data.sessionId)
    })

    socketRef.current.on(
      'research-complete',
      (data: { id: number; response: string; traceId?: string; sessionId?: string }) => {
        if (data.sessionId) {
          setSessionId(data.sessionId)
        }
        const assistantMessage: Message = {
          id: data.id.toString(),
          type: 'assistant',
          content: data.response,
          timestamp: new Date(),
          traceId: data.traceId,
          feedbackStatus: 'idle',
        }
        setMessages(prev => [...prev, assistantMessage])
        setIsLoading(false)
      }
    )

    socketRef.current.on('research-error', (error: { error: string }) => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `Sorry, I encountered an error: ${error.error}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
    })

    // Handle feedback responses
    socketRef.current.on(
      'feedback-logged',
      (data: { messageId: string; success: boolean; error?: string }) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, feedbackStatus: data.success ? 'submitted' : 'error' }
              : msg
          )
        )
      }
    )

    // Add initial welcome message
    setMessages([
      {
        id: '1',
        type: 'assistant',
        content:
          'Hello! I\'m your Web Research Assistant. I can help you search for information, analyze web content, and answer questions using various web tools. Try asking me something like "What\'s the latest news about TypeScript?"',
        timestamp: new Date(),
      },
    ])

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setToolExecutions([]) // Clear previous tool executions

    // Send message to backend via socket
    if (socketRef.current) {
      socketRef.current.emit('research-query', { message: content, sessionId })
    }
  }

  const handleSubmitFeedback = (
    messageId: string,
    traceId: string,
    thumbsUp: boolean,
    rationale?: string
  ) => {
    // Update message status to submitting
    setMessages(prev =>
      prev.map(msg => (msg.id === messageId ? { ...msg, feedbackStatus: 'submitting' } : msg))
    )

    // Send feedback to backend
    if (socketRef.current) {
      socketRef.current.emit('submit-feedback', {
        messageId,
        traceId,
        thumbsUp,
        rationale,
      })
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-md border-b border-gray-200/50 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-[#0194e2] to-[#43edbc] rounded-xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-200">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-gray-700 to-[#0194e2] bg-clip-text text-transparent">
                  Web Research Assistant
                </h1>
                <p className="text-xs text-gray-500">Powered by MLflow</p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            onSubmitFeedback={handleSubmitFeedback}
          />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white">
          <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
        </div>
      </div>

      {/* Tool Execution Panel */}
      <div className="w-80 border-l border-gray-200/50 bg-gray-50/70 backdrop-blur-sm">
        <ToolExecutionPanel toolExecutions={toolExecutions} />
      </div>
    </div>
  )
}

export default ChatInterface
