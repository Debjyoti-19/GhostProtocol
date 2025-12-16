/**
 * Middleware exports for GhostProtocol
 */
export { errorHandlerMiddleware } from './error-handler.middleware.js'
export { auditLoggerMiddleware } from './audit-logger.middleware.js'
export { authMiddleware, requireRole } from './auth.middleware.js'