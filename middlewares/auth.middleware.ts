import * as jwt from 'jsonwebtoken'
import { IdentityValidationError } from '../src/gdpr/errors/index.js'

/**
 * Authentication middleware for GhostProtocol
 * Validates JWT tokens and enforces role-based access control
 */
export const authMiddleware = {
  name: 'auth',
  handler: async (context: any, next: () => Promise<any>) => {
    const authHeader = context.request?.headers?.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new IdentityValidationError('Missing or invalid authorization header')
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    
    try {
      // In production, use a proper JWT secret from environment variables
      const JWT_SECRET = process.env.JWT_SECRET || 'ghost-protocol-dev-secret'
      const decoded = jwt.verify(token, JWT_SECRET) as any

      // Add user information to context
      context.user = {
        userId: decoded.sub,
        role: decoded.role,
        organization: decoded.org,
        permissions: decoded.permissions || []
      }

      return await next()
    } catch (error) {
      throw new IdentityValidationError('Invalid or expired token')
    }
  }
}

/**
 * Role-based authorization middleware
 * Checks if user has required role for the operation
 */
export const requireRole = (requiredRole: string) => ({
  name: `require-role-${requiredRole}`,
  handler: async (context: any, next: () => Promise<any>) => {
    if (!context.user) {
      throw new IdentityValidationError('Authentication required')
    }

    if (context.user.role !== requiredRole && context.user.role !== 'admin') {
      throw new IdentityValidationError(`Insufficient permissions. Required role: ${requiredRole}`)
    }

    return await next()
  }
})