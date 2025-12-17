/**
 * Base error class for GhostProtocol following Motia patterns
 * Provides structured error handling with metadata and proper HTTP status codes
 */
export class BaseError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly metadata: Record<string, any>
  public readonly timestamp: string

  constructor(
    message: string,
    status: number = 500,
    code: string = 'INTERNAL_ERROR',
    metadata: Record<string, any> = {}
  ) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.metadata = metadata
    this.timestamp = new Date().toISOString()

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Converts error to JSON format for API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }

  /**
   * Creates a sanitized version for client responses (removes stack trace)
   */
  toClientJSON() {
    return {
      message: this.message,
      status: this.status,
      code: this.code,
      timestamp: this.timestamp
    }
  }
}