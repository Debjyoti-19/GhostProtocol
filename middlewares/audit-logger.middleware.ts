import { v4 as uuidv4 } from 'uuid'

/**
 * Audit logging middleware for GhostProtocol
 * Logs all requests and responses for compliance and debugging
 */
export const auditLoggerMiddleware = {
  name: 'audit-logger',
  handler: async (context: any, next: () => Promise<any>) => {
    const requestId = uuidv4()
    const startTime = Date.now()
    
    // Log incoming request
    console.log(`[AUDIT] ${requestId} - Request started`, {
      method: context.request?.method,
      url: context.request?.url,
      headers: context.request?.headers,
      timestamp: new Date().toISOString(),
      userAgent: context.request?.headers?.['user-agent']
    })

    try {
      const result = await next()
      const duration = Date.now() - startTime

      // Log successful response
      console.log(`[AUDIT] ${requestId} - Request completed`, {
        status: result?.status || 200,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Log error response
      console.error(`[AUDIT] ${requestId} - Request failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })

      throw error
    }
  }
}