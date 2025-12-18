import * as jwt from 'jsonwebtoken'
import { IdentityValidationError } from '../src/gdpr/errors/index.js'

/**
 * Authentication middleware for GhostProtocol
 * Validates JWT tokens and enforces role-based access control
 * 
 * Requirements: 7.2
 */

// User roles for RBAC
export type UserRole = 'Legal' | 'Compliance Admin' | 'Auditor' | 'System Admin'

export interface AuthenticatedUser {
  userId: string
  email: string
  role: UserRole
  organization: string
  permissions?: string[]
}

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
        userId: decoded.sub || decoded.userId,
        email: decoded.email,
        role: decoded.role,
        organization: decoded.org || decoded.organization,
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
 * Supports multiple roles
 */
export const requireRole = (...allowedRoles: string[]) => ({
  name: `require-role-${allowedRoles.join('-')}`,
  handler: async (context: any, next: () => Promise<any>) => {
    if (!context.user) {
      throw new IdentityValidationError('Authentication required')
    }

    // System Admin has access to everything
    if (context.user.role === 'System Admin') {
      return await next()
    }

    if (!allowedRoles.includes(context.user.role)) {
      throw new IdentityValidationError(
        `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`
      )
    }

    return await next()
  }
})

/**
 * Helper functions for role checking
 */
export const hasRole = (user: AuthenticatedUser | undefined, ...roles: UserRole[]): boolean => {
  if (!user) return false
  return roles.includes(user.role)
}

export const canOverride = (user: AuthenticatedUser | undefined): boolean => {
  return hasRole(user, 'Legal', 'Compliance Admin', 'System Admin')
}

export const canDownloadCertificate = (user: AuthenticatedUser | undefined): boolean => {
  return hasRole(user, 'Legal', 'Compliance Admin', 'Auditor', 'System Admin')
}

export const canAccessStreams = (user: AuthenticatedUser | undefined): boolean => {
  return hasRole(user, 'Legal', 'Compliance Admin', 'Auditor', 'System Admin')
}

/**
 * Generate JWT token for testing/demo purposes
 */
export const generateToken = (user: AuthenticatedUser): string => {
  const JWT_SECRET = process.env.JWT_SECRET || 'ghost-protocol-dev-secret'
  return jwt.sign(
    {
      sub: user.userId,
      userId: user.userId,
      email: user.email,
      role: user.role,
      org: user.organization,
      organization: user.organization
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

/**
 * Create demo tokens for different roles
 */
export const createDemoTokens = () => {
  const roles: UserRole[] = ['Legal', 'Compliance Admin', 'Auditor', 'System Admin']
  
  return roles.reduce((tokens, role) => {
    const user: AuthenticatedUser = {
      userId: `demo-${role.toLowerCase().replace(' ', '-')}`,
      email: `${role.toLowerCase().replace(' ', '.')}@ghostprotocol.demo`,
      role,
      organization: 'GhostProtocol Demo'
    }
    tokens[role] = generateToken(user)
    return tokens
  }, {} as Record<UserRole, string>)
}