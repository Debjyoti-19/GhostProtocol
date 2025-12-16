import { z } from 'zod'
import { BaseError } from '../src/gdpr/errors/base-error.js'

/**
 * Error handling middleware for GhostProtocol
 * Handles Zod validation errors, custom errors, and unexpected errors
 */
export const errorHandlerMiddleware = {
  name: 'error-handler',
  handler: async (context: any, next: () => Promise<any>) => {
    try {
      return await next()
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const validationErrors = error.issues.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }))

        return {
          status: 400,
          body: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors: validationErrors,
            timestamp: new Date().toISOString()
          }
        }
      }

      // Handle custom BaseError instances
      if (error instanceof BaseError) {
        return {
          status: error.status,
          body: error.toClientJSON()
        }
      }

      // Handle unexpected errors
      console.error('Unexpected error:', error)
      
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString()
        }
      }
    }
  }
}