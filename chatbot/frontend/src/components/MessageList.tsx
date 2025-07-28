import { useEffect, useRef } from 'react'
import { User, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from './ChatInterface'
import FeedbackWidget from './FeedbackWidget'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  onSubmitFeedback: (
    messageId: string,
    traceId: string,
    thumbsUp: boolean,
    rationale?: string
  ) => void
}

const MessageList = ({ messages, isLoading, onSubmitFeedback }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-300`}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div
            className={`flex max-w-4xl ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'} group`}
          >
            {/* Avatar */}
            <div className={`flex-shrink-0 ${message.type === 'user' ? 'ml-3' : 'mr-3'}`}>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transform group-hover:scale-110 transition-all duration-200 ${
                  message.type === 'user'
                    ? 'bg-gradient-to-r from-[#0194e2] to-[#43edbc] text-white'
                    : 'bg-gradient-to-r from-[#0194e2] to-[#0194e2]/80 text-white'
                }`}
              >
                {message.type === 'user' ? (
                  <User className="w-5 h-5" />
                ) : (
                  <Bot className="w-5 h-5" />
                )}
              </div>
            </div>

            {/* Message Bubble */}
            <div
              className={`flex flex-col ${message.type === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`px-5 py-3 rounded-2xl max-w-full shadow-sm transform hover:shadow-lg transition-all duration-200 ${
                  message.type === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-200/50 text-gray-900 rounded-bl-md backdrop-blur-sm'
                }`}
              >
                {message.type === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Custom styling for markdown elements
                        h1: ({ children }) => (
                          <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold mb-2 mt-3">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold mb-2 mt-2">{children}</h3>
                        ),
                        p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => <li className="ml-2">{children}</li>,
                        code: ({ children, ...props }) => {
                          const isInline = !props.className?.includes('language-')
                          return isInline ? (
                            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-gray-100 text-gray-800 p-3 rounded-lg my-2 overflow-x-auto font-mono text-sm">
                              {children}
                            </code>
                          )
                        },
                        pre: ({ children }) => (
                          <pre className="bg-gray-100 rounded-lg overflow-x-auto">{children}</pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-gray-300 pl-4 italic my-3 text-gray-700">
                            {children}
                          </blockquote>
                        ),
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            className="text-blue-600 hover:text-blue-800 underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold">{children}</strong>
                        ),
                        em: ({ children }) => <em className="italic">{children}</em>,
                        hr: () => <hr className="my-4 border-gray-300" />,
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3">
                            <table className="min-w-full border-collapse border border-gray-300">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-gray-300 px-3 py-2 bg-gray-100 font-semibold text-left">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-gray-300 px-3 py-2">{children}</td>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {formatTime(message.timestamp)}
              </span>

              {/* Feedback Widget for assistant messages */}
              {message.type === 'assistant' && message.traceId && (
                <div className="max-w-full">
                  <FeedbackWidget
                    messageId={message.id}
                    traceId={message.traceId}
                    onSubmitFeedback={onSubmitFeedback}
                    feedbackStatus={message.feedbackStatus}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-start animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex max-w-4xl group">
            <div className="flex-shrink-0 mr-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0194e2] to-[#0194e2]/80 text-white flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="flex flex-col items-start">
              <div className="px-5 py-3 rounded-2xl rounded-bl-md bg-white border border-gray-200/50 shadow-sm backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-[#43edbc] rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-[#43edbc] rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-[#43edbc] rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">Researching...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

export default MessageList
