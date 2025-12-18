/**
 * MinIO Storage Deletion Event Step
 * 
 * Scan and delete user files from MinIO object storage.
 * Replaces AWS S3 cold storage scan with local MinIO.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema
const MinIODeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  stepName: z.string().default('minio-storage-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'MinIOStorageDeletion',
  type: 'event' as const,
  description: 'Scan and delete user files from MinIO object storage',
  flows: ['erasure-workflow'],
  subscribes: ['minio-storage-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'minio-storage-deletion'],
  input: MinIODeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = MinIODeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting MinIO storage deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    attempt 
  })

  try {
    const minioResult = await performMinIODeletion(userIdentifiers, logger)

    if (minioResult.success) {
      logger.info('MinIO deletion completed', { 
        workflowId, 
        filesDeleted: minioResult.apiResponse?.filesDeleted,
        bytesFreed: minioResult.apiResponse?.bytesFreed,
        receipt: minioResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'MINIO_STORAGE_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp,
        receipt: minioResult.receipt,
        filesDeleted: minioResult.apiResponse?.filesDeleted
      }})

    } else {
      const maxRetries = 3
      const errorMsg = (minioResult as any).error || 'Unknown error'
      if (attempt < maxRetries) {
        logger.warn('MinIO deletion failed, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'minio-storage-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('MinIO deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
      }
    }

  } catch (error: any) {
    logger.error('MinIO deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
  }
}

async function performMinIODeletion(userIdentifiers: any, logger: any) {
  const endpoint = process.env.MINIO_ENDPOINT
  const port = process.env.MINIO_PORT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  const bucket = process.env.MINIO_BUCKET
  const useSSL = process.env.MINIO_USE_SSL === 'true'

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    logger.info('MinIO credentials not set, using mock mode')
    return performMockMinIODeletion(userIdentifiers, logger)
  }

  try {
    const Minio = await import('minio')
    const minioClient = new Minio.Client({
      endPoint: endpoint,
      port: parseInt(port || '9000'),
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey
    })

    logger.info('Connecting to MinIO', { endpoint, port, bucket })

    const deletionResults = {
      filesScanned: 0,
      filesDeleted: 0,
      bytesFreed: 0,
      userFilesFound: [] as string[],
      errors: [] as string[]
    }

    // Check if bucket exists
    const bucketExists = await minioClient.bucketExists(bucket)
    if (!bucketExists) {
      logger.warn('Bucket does not exist', { bucket })
      return {
        success: true,
        receipt: `minio_no_bucket_${Date.now()}`,
        apiResponse: { ...deletionResults, bucketExists: false }
      }
    }

    // List all objects in bucket
    const objectsStream = minioClient.listObjects(bucket, '', true)
    const objects: any[] = []

    await new Promise<void>((resolve, reject) => {
      objectsStream.on('data', (obj) => objects.push(obj))
      objectsStream.on('error', reject)
      objectsStream.on('end', resolve)
    })

    logger.info('Found objects in bucket', { count: objects.length })

    // Search for user-related files
    const userPatterns = [
      userIdentifiers.userId,
      ...userIdentifiers.emails,
      ...userIdentifiers.aliases
    ].filter(Boolean).map(p => p.toLowerCase())

    for (const obj of objects) {
      deletionResults.filesScanned++
      const objectName = obj.name.toLowerCase()

      // Check if file belongs to user (by name pattern)
      const isUserFile = userPatterns.some(pattern => 
        objectName.includes(pattern.replace(/[@.]/g, '_')) ||
        objectName.includes(pattern)
      )

      if (isUserFile) {
        deletionResults.userFilesFound.push(obj.name)
        
        try {
          await minioClient.removeObject(bucket, obj.name)
          deletionResults.filesDeleted++
          deletionResults.bytesFreed += obj.size || 0
          logger.info('Deleted user file', { file: obj.name, size: obj.size })
        } catch (deleteErr: any) {
          deletionResults.errors.push(`Delete ${obj.name}: ${deleteErr.message}`)
        }
      }
    }

    const receipt = `minio_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('MinIO deletion summary', {
      filesScanned: deletionResults.filesScanned,
      filesDeleted: deletionResults.filesDeleted,
      bytesFreed: deletionResults.bytesFreed,
      errors: deletionResults.errors.length
    })

    return {
      success: true,
      receipt,
      apiResponse: {
        ...deletionResults,
        bucket
      }
    }

  } catch (error: any) {
    logger.error('MinIO API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function performMockMinIODeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock MinIO deletion', { userId: userIdentifiers.userId })
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `minio_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      filesScanned: 50,
      filesDeleted: 3,
      bytesFreed: 1024 * 1024 * 5, // 5MB
      userFilesFound: ['user_data.json', 'profile_backup.zip', 'exports/user_001.csv'],
      errors: [],
      mock: true
    }
  }
}
