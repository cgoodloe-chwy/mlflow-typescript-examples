export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface ChatSession {
  id: string
  messages: ChatMessage[]
  createdAt: Date
  lastActivity: Date
}

export class ChatSessionManager {
  private sessions: Map<string, ChatSession> = new Map()
  private cleanupInterval: NodeJS.Timeout
  private readonly SESSION_EXPIRE_MS = 60 * 60 * 1000 // 1 hour
  private readonly MAX_SESSIONS = 100
  private readonly MAX_MESSAGES_PER_SESSION = 100

  constructor() {
    // Run cleanup every 10 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      10 * 60 * 1000
    )
  }

  createSession(): string {
    const sessionId = this.generateSessionId()
    const session: ChatSession = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    }

    this.sessions.set(sessionId, session)
    this.enforceSessionLimit()

    console.log(`Created new chat session: ${sessionId}`)
    return sessionId
  }

  getSession(sessionId: string): ChatSession | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.sessions.delete(sessionId)
      console.log(`Session ${sessionId} expired and removed`)
      return null
    }

    // Update last activity
    session.lastActivity = new Date()
    return session
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): boolean {
    const session = this.getSession(sessionId)
    if (!session) {
      return false
    }

    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date(),
    }

    session.messages.push(message)
    session.lastActivity = new Date()

    // Enforce message limit per session
    if (session.messages.length > this.MAX_MESSAGES_PER_SESSION) {
      const removedCount = session.messages.length - this.MAX_MESSAGES_PER_SESSION
      session.messages.splice(0, removedCount)
      console.log(`Removed ${removedCount} old messages from session ${sessionId}`)
    }

    return true
  }

  getMessages(sessionId: string): ChatMessage[] {
    const session = this.getSession(sessionId)
    return session ? session.messages : []
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId)
    if (deleted) {
      console.log(`Deleted session: ${sessionId}`)
    }
    return deleted
  }

  getSessionCount(): number {
    return this.sessions.size
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substr(2, 9).toString()
  }

  private isSessionExpired(session: ChatSession): boolean {
    const now = new Date()
    return now.getTime() - session.lastActivity.getTime() > this.SESSION_EXPIRE_MS
  }

  private enforceSessionLimit(): void {
    if (this.sessions.size <= this.MAX_SESSIONS) {
      return
    }

    // Convert to array and sort by last activity (oldest first)
    const sessionEntries = Array.from(this.sessions.entries()).sort(
      (a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime()
    )

    // Remove oldest sessions until we're under the limit
    const sessionsToRemove = sessionEntries.slice(0, this.sessions.size - this.MAX_SESSIONS)
    for (const [sessionId] of sessionsToRemove) {
      this.sessions.delete(sessionId)
      console.log(`Removed old session due to limit: ${sessionId}`)
    }
  }

  private cleanup(): void {
    const beforeCount = this.sessions.size
    const expiredSessions: string[] = []

    // Find expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(sessionId)
      }
    }

    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId)
    }

    // Enforce session limit
    this.enforceSessionLimit()

    const afterCount = this.sessions.size
    if (beforeCount !== afterCount) {
      console.log(
        `Cleanup completed: ${beforeCount} → ${afterCount} sessions (${beforeCount - afterCount} removed)`
      )
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.sessions.clear()
  }
}
