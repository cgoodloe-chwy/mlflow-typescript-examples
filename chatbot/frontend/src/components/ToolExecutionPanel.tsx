import { Activity, CheckCircle, XCircle, Loader2, Wrench, Clock } from 'lucide-react'
import type { ToolExecution } from './ChatInterface'

interface ToolExecutionPanelProps {
  toolExecutions: ToolExecution[]
}

const ToolExecutionPanel = ({ toolExecutions }: ToolExecutionPanelProps) => {
  const getStatusIcon = (status: ToolExecution['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-[#0194e2] animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-[#0194e2]" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status: ToolExecution['status']) => {
    switch (status) {
      case 'running':
        return 'text-[#0194e2]/80 bg-gray-50/50 border-gray-200/30'
      case 'completed':
        return 'text-[#0194e2]/80 bg-gray-50/50 border-gray-200/30'
      case 'error':
        return 'text-red-600/80 bg-gray-50/50 border-gray-200/30'
      default:
        return 'text-gray-600 bg-gray-50/50 border-gray-200/30'
    }
  }

  const formatDuration = (duration?: number) => {
    if (!duration) return ''
    return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200/50 bg-gray-50/50 backdrop-blur-sm">
        <div className="flex items-center space-x-2 mb-1">
          <Activity className="w-5 h-5 text-[#0194e2]" />
          <h2 className="text-lg font-bold bg-gradient-to-r from-gray-700 to-[#0194e2] bg-clip-text text-transparent">
            Active Tools
          </h2>
        </div>
        <p className="text-sm text-gray-500">Real-time tool execution logs</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {toolExecutions.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
              <Wrench className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium">No tools running</p>
            <p className="text-xs mt-1 text-gray-400">Tool executions will appear here</p>
          </div>
        ) : (
          toolExecutions.map((tool, index) => (
            <div
              key={tool.id}
              className={`p-3 rounded-lg border backdrop-blur-sm transform hover:scale-102 transition-all duration-200 animate-in slide-in-from-right-4 ${getStatusColor(tool.status)}`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(tool.status)}
                  <span className="font-semibold text-sm">{tool.name}</span>
                </div>
                {tool.duration && (
                  <div className="flex items-center space-x-1 text-xs font-mono bg-white/50 px-2 py-1 rounded-full">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(tool.duration)}</span>
                  </div>
                )}
              </div>

              <p className="text-xs opacity-80 mb-3 leading-relaxed">{tool.description}</p>

              {tool.result && (
                <div className="text-xs bg-gray-50/30 rounded-lg p-3 mt-3 border border-gray-200/20">
                  <span className="font-semibold text-gray-700">Result: </span>
                  <span className="text-gray-600">{tool.result}</span>
                </div>
              )}

              {tool.error && (
                <div className="text-xs bg-red-50/30 rounded-lg p-3 mt-3 border border-red-200/20">
                  <span className="font-semibold text-red-600">Error: </span>
                  <span className="text-red-500">{tool.error}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ToolExecutionPanel
