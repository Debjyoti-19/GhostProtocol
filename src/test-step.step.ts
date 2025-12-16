/**
 * Simple test step to verify build works
 */

import { z } from 'zod'

const TestInputSchema = z.object({
  message: z.string()
})

export const config = {
  name: 'TestStep',
  type: 'event' as const,
  description: 'Simple test step',
  subscribes: ['test'],
  emits: [],
  input: TestInputSchema
}

export async function handler(input: any, { logger }: any): Promise<void> {
  logger?.info('Test step executed', { input })
}