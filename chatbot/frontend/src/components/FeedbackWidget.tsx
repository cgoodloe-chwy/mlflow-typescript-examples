import { useState } from 'react'
import { ThumbsUp, ThumbsDown, MessageSquare, Send, Check, X } from 'lucide-react'

interface FeedbackWidgetProps {
  messageId: string
  traceId: string
  onSubmitFeedback: (
    messageId: string,
    traceId: string,
    thumbsUp: boolean,
    rationale?: string
  ) => void
  feedbackStatus?: 'idle' | 'submitting' | 'submitted' | 'error'
}

type FeedbackState = 'idle' | 'selected' | 'submitting' | 'submitted' | 'error'

const FeedbackWidget = ({
  messageId,
  traceId,
  onSubmitFeedback,
  feedbackStatus = 'idle',
}: FeedbackWidgetProps) => {
  const [selectedFeedback, setSelectedFeedback] = useState<boolean | null>(null)
  const [rationale, setRationale] = useState('')
  const [showRationale, setShowRationale] = useState(false)

  const handleFeedbackClick = (thumbsUp: boolean) => {
    if (feedbackStatus === 'submitted') return

    setSelectedFeedback(thumbsUp)
    setShowRationale(true)
  }

  const handleSubmit = () => {
    if (selectedFeedback === null) return

    onSubmitFeedback(messageId, traceId, selectedFeedback, rationale.trim() || undefined)
  }

  const handleCancel = () => {
    setSelectedFeedback(null)
    setRationale('')
    setShowRationale(false)
  }

  if (feedbackStatus === 'submitted') {
    return (
      <div className="flex items-center space-x-2 text-green-600 text-sm mt-2 opacity-75">
        <Check className="w-4 h-4" />
        <span>Thank you for your feedback!</span>
      </div>
    )
  }

  if (feedbackStatus === 'error') {
    return (
      <div className="flex items-center space-x-2 text-red-600 text-sm mt-2 opacity-75">
        <X className="w-4 h-4" />
        <span>Failed to submit feedback. Please try again.</span>
      </div>
    )
  }

  return (
    <div className="mt-3 pt-2 border-t border-gray-100">
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-500">Was this response helpful?</span>

        <div className="flex space-x-1">
          <button
            onClick={() => handleFeedbackClick(true)}
            disabled={feedbackStatus === 'submitting'}
            className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-110 ${
              selectedFeedback === true
                ? 'bg-green-100 text-green-600 shadow-sm'
                : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
            } ${feedbackStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleFeedbackClick(false)}
            disabled={feedbackStatus === 'submitting'}
            className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-110 ${
              selectedFeedback === false
                ? 'bg-red-100 text-red-600 shadow-sm'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            } ${feedbackStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rationale input */}
      {showRationale && (
        <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-start space-x-2">
            <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <textarea
                value={rationale}
                onChange={e => setRationale(e.target.value)}
                placeholder="Optional: Tell us more about your feedback..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-400"
                rows={3}
                disabled={feedbackStatus === 'submitting'}
              />

              <div className="flex items-center justify-end space-x-2 mt-2">
                <button
                  onClick={handleCancel}
                  disabled={feedbackStatus === 'submitting'}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={feedbackStatus === 'submitting'}
                  className={`flex items-center space-x-1 text-xs px-3 py-1 rounded-lg transition-all duration-200 ${
                    feedbackStatus === 'submitting'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-sm'
                  }`}
                >
                  {feedbackStatus === 'submitting' ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Submit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FeedbackWidget
export type { FeedbackState }
