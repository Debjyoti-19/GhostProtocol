/**
 * Demo Tokens API Step
 * 
 * Generates demo JWT tokens for testing the admin dashboard
 * This endpoint should be disabled in production
 * 
 * Requirements: 7.2
 */

import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import * as jwt from 'jsonwebtoken'

// User roles for RBAC
type UserRole = 'Legal' | 'Compliance Admin' | 'Auditor' | 'System Admin'

interface AuthenticatedUser {
  userId: string
  email: string
  role: UserRole
  organization: string
}

// Generate JWT token
const generateToken = (user: AuthenticatedUser): string => {
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

// Create demo tokens for different roles
const createDemoTokens = () => {
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

export const config: ApiRouteConfig = {
  name: 'DemoTokens',
  type: 'api',
  path: '/demo/tokens',
  method: 'GET',
  description: 'Generate demo JWT tokens for testing (DEMO ONLY - disable in production)',
  middleware: [],
  emits: [],
  flows: ['demo'],
  responseSchema: {
    200: z.object({
      tokens: z.record(z.string(), z.string()),
      instructions: z.string()
    })
  }
}

export const handler: Handlers['DemoTokens'] = async (req, { logger }) => {
  // Check if we're in production
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Demo tokens endpoint accessed in production')
    return {
      status: 403,
      body: { error: 'Demo tokens not available in production' }
    }
  }

  logger.info('Generating demo tokens')

  const tokens = createDemoTokens()

  return {
    status: 200,
    body: {
      tokens,
      instructions: 'Use these tokens in the Authorization header as "Bearer <token>" to access the admin dashboard with different roles'
    }
  }
}
