import { useState } from 'react'
import { Send, Sparkles } from 'lucide-react'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
}

const ChatInput = ({ onSendMessage, disabled }: ChatInputProps) => {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="p-6 bg-white/80 backdrop-blur-md">
      <form onSubmit={handleSubmit} className="flex space-x-4">
        <div className="flex-1 relative">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me to research anything on the web..."
            className="w-full px-4 py-3 pr-12 border border-gray-300/50 rounded-xl resize-none focus:ring-2 focus:ring-[#0194e2] focus:border-transparent outline-none bg-white/90 backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md"
            rows={1}
            disabled={disabled}
            style={{
              minHeight: '48px',
              maxHeight: '120px',
              resize: 'none',
            }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`
            }}
          />
          <Sparkles className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
        </div>
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="group px-6 py-3 bg-gradient-to-r from-[#0194e2] to-[#43edbc] text-white rounded-xl hover:from-[#0194e2]/90 hover:to-[#43edbc]/90 focus:ring-2 focus:ring-[#0194e2] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100 shadow-lg flex items-center space-x-2"
        >
          <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
          <span className="font-medium">Send</span>
        </button>
      </form>

      {/* Quick examples */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-sm text-gray-500 font-medium">✨ Try asking:</span>
        {[
          'What does MLflow help with for LLM/Agents developers?',
          'Why MLflow tracing is important for GenAI projects?',
          'How to get involved in MLflow community?',
        ].map((example, index) => (
          <button
            key={index}
            onClick={() => !disabled && setMessage(example)}
            disabled={disabled}
            className="text-sm text-[#0194e2] hover:text-[#0194e2]/80 hover:bg-[#43edbc]/10 px-3 py-1 rounded-full border border-[#0194e2]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ChatInput
