/**
 * MinIO Storage Deletion Event Step (Background Job)
 * 
 * Scan and delete user files from MinIO object storage.
 * This is a BACKGROUND JOB that runs independently from the main workflow.
 * Triggered by the orchestrator alongside the main deletion chain.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

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
  attempt: z.number().int().min(1).default(1),
  // Background job specific fields
  resumeFromCheckpoint: z.string().optional(),
  batchSize: z.number().int().min(1).max(10000).default(1000)
})

export const config = {
  name: 'MinIOStorageDeletion',
  type: 'event' as const,
  description: 'Background job: Scan and delete user files from MinIO object storage',
  flows: ['erasure-workflow'],
  subscribes: ['minio-storage-deletion'],
  emits: ['background-job-progress', 'audit-log', 'minio-storage-deletion'],
  input: MinIODeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = MinIODeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt, resumeFromCheckpoint } = parsed
  const timestamp = new Date().toISOString()
  const jobId = uuidv4()

  logger.info('Starting MinIO storage background job', {
    workflowId,
    jobId,
    userId: userIdentifiers.userId,
    attempt,
    isResume: !!resumeFromCheckpoint
  })

  // Emit job started
  await emit({
    topic: 'background-job-progress',
    data: {
      jobId,
      workflowId,
      jobType: 'MINIO_STORAGE_SCAN',
      status: resumeFromCheckpoint ? 'RESUMED' : 'STARTED',
      progress: 0,
      timestamp
    }
  })

  try {
    const minioResult = await performMinIODeletion(userIdentifiers, logger, async (progress: number, details: any) => {
      // Progress callback for long-running scans
      await emit({
        topic: 'background-job-progress',
        data: {
          jobId,
          workflowId,
          jobType: 'MINIO_STORAGE_SCAN',
          status: 'RUNNING',
          progress,
          ...details,
          timestamp: new Date().toISOString()
        }
      })
    })

    if (minioResult.success) {
      logger.info('MinIO background job completed', {
        workflowId,
        jobId,
        filesDeleted: minioResult.apiResponse?.filesDeleted,
        bytesFreed: minioResult.apiResponse?.bytesFreed,
        receipt: minioResult.receipt
      })

      // Emit job completed
      await emit({
        topic: 'background-job-progress',
        data: {
          jobId,
          workflowId,
          jobType: 'MINIO_STORAGE_SCAN',
          status: 'COMPLETED',
          progress: 100,
          filesScanned: minioResult.apiResponse?.filesScanned,
          filesDeleted: minioResult.apiResponse?.filesDeleted,
          bytesFreed: minioResult.apiResponse?.bytesFreed,
          receipt: minioResult.receipt,
          timestamp: new Date().toISOString()
        }
      })

      await emit({
        topic: 'audit-log',
        data: {
          event: 'MINIO_BACKGROUND_JOB_COMPLETED',
          workflowId,
          jobId,
          stepName,
          timestamp: new Date().toISOString(),
          receipt: minioResult.receipt,
          filesDeleted: minioResult.apiResponse?.filesDeleted,
          bytesFreed: minioResult.apiResponse?.bytesFreed
        }
      })

    } else {
      const maxRetries = 3
      const errorMsg = (minioResult as any).error || 'Unknown error'

      if (attempt < maxRetries) {
        logger.warn('MinIO background job failed, scheduling retry', { workflowId, jobId, attempt, error: errorMsg })

        await emit({
          topic: 'background-job-progress',
          data: {
            jobId,
            workflowId,
            jobType: 'MINIO_STORAGE_SCAN',
            status: 'RETRYING',
            error: errorMsg,
            attempt,
            nextAttempt: attempt + 1,
            timestamp: new Date().toISOString()
          }
        })

        await emit({ topic: 'minio-storage-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('MinIO background job failed after max retries', { workflowId, jobId, error: errorMsg })

        await emit({
          topic: 'background-job-progress',
          data: {
            jobId,
            workflowId,
            jobType: 'MINIO_STORAGE_SCAN',
            status: 'FAILED',
            error: errorMsg,
            timestamp: new Date().toISOString()
          }
        })

        await emit({
          topic: 'audit-log',
          data: {
            event: 'MINIO_BACKGROUND_JOB_FAILED',
            workflowId,
            jobId,
            error: errorMsg,
            timestamp: new Date().toISOString()
          }
        })
      }
    }

  } catch (error: any) {
    logger.error('MinIO background job error', { workflowId, jobId, error: error.message })

    await emit({
      topic: 'background-job-progress',
      data: {
        jobId,
        workflowId,
        jobType: 'MINIO_STORAGE_SCAN',
        status: 'FAILED',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    })
  }
}

async function performMinIODeletion(
  userIdentifiers: any,
  logger: any,
  onProgress?: (progress: number, details: any) => Promise<void>
) {
  const endpoint = process.env.MINIO_ENDPOINT
  const port = process.env.MINIO_PORT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  const bucket = process.env.MINIO_BUCKET
  const useSSL = process.env.MINIO_USE_SSL === 'true'

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    logger.info('MinIO credentials not set, using mock mode')
    return performMockMinIODeletion(userIdentifiers, logger, onProgress)
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

    // Search for user-related files - build comprehensive patterns
    const rawPatterns = [
      userIdentifiers.userId,
      ...userIdentifiers.emails,
      ...userIdentifiers.aliases
    ].filter(Boolean)

    // Generate multiple pattern variations for each identifier
    const userPatterns: string[] = []
    for (const p of rawPatterns) {
      const lower = p.toLowerCase()
      userPatterns.push(lower)
      userPatterns.push(lower.replace(/@/g, '_at_'))  // email@domain.com -> email_at_domain.com
      userPatterns.push(lower.replace(/[@.]/g, '_'))  // email@domain.com -> email_domain_com
      userPatterns.push(lower.replace(/ /g, '_'))     // "E2E Test User" -> "e2e_test_user"
      userPatterns.push(lower.replace(/[^a-z0-9]/g, '_')) // any special char -> underscore

      // For emails, also match the local part (before @)
      if (p.includes('@')) {
        const localPart = p.split('@')[0].toLowerCase()
        userPatterns.push(localPart)
        userPatterns.push(localPart.replace(/\./g, '_'))
        userPatterns.push(localPart.replace(/[^a-z0-9]/g, '_'))
      }

      // For names with spaces, extract individual words
      if (p.includes(' ')) {
        const words = p.toLowerCase().split(/\s+/)
        words.forEach((word: string) => {
          if (word.length > 2) { // Only meaningful words
            userPatterns.push(word)
            userPatterns.push(word.replace(/[^a-z0-9]/g, '_'))
          }
        })
      }
    }

    // Remove duplicates
    const uniquePatterns = [...new Set(userPatterns)]

    logger.info('MinIO user patterns generated', {
      count: uniquePatterns.length,
      patterns: uniquePatterns,
      rawIdentifiers: rawPatterns
    })

    const totalObjects = objects.length

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
      deletionResults.filesScanned++
      const objectName = obj.name.toLowerCase()

      // Report progress every 10 files or at completion
      if (onProgress && (i % 10 === 0 || i === objects.length - 1)) {
        const progress = Math.round((i / totalObjects) * 100)
        await onProgress(progress, {
          filesScanned: deletionResults.filesScanned,
          filesDeleted: deletionResults.filesDeleted,
          currentFile: obj.name
        })
      }

      // Check if file belongs to user (by name pattern)
      const matchingPatterns = uniquePatterns.filter(pattern =>
        objectName.includes(pattern.replace(/[@.]/g, '_')) ||
        objectName.includes(pattern)
      )

      const isUserFile = matchingPatterns.length > 0

      if (isUserFile) {
        deletionResults.userFilesFound.push(obj.name)

        logger.info('File matched for deletion', {
          file: obj.name,
          matchedPatterns: matchingPatterns.slice(0, 5),
          size: obj.size
        })

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

async function performMockMinIODeletion(
  userIdentifiers: any,
  logger: any,
  onProgress?: (progress: number, details: any) => Promise<void>
) {
  logger.info('Running mock MinIO background job', { userId: userIdentifiers.userId })

  // Simulate scanning progress
  const mockFiles = ['user_data.json', 'profile_backup.zip', 'exports/user_001.csv']

  for (let i = 0; i <= 100; i += 20) {
    if (onProgress) {
      await onProgress(i, {
        filesScanned: Math.floor(i / 2),
        filesDeleted: Math.floor(i / 33),
        currentFile: mockFiles[Math.floor(i / 40)] || 'scanning...'
      })
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return {
    success: true,
    receipt: `minio_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      filesScanned: 50,
      filesDeleted: 3,
      bytesFreed: 1024 * 1024 * 5, // 5MB
      userFilesFound: mockFiles,
      errors: [],
      mock: true
    }
  }
}
