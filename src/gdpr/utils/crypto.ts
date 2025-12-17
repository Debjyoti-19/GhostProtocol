import { createHash, createSign, createVerify } from 'crypto'

/**
 * Cryptographic utilities for GhostProtocol
 * Handles hash chains, signatures, and tamper detection
 */
export class CryptoUtils {
  /**
   * Creates SHA-256 hash of input data
   */
  static createHash(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex')
  }

  /**
   * Creates hash chain by combining previous hash with new data
   */
  static createHashChain(previousHash: string, newData: any): string {
    const dataString = typeof newData === 'string' ? newData : JSON.stringify(newData)
    const combined = `${previousHash}:${dataString}`
    return this.createHash(combined)
  }

  /**
   * Verifies hash chain integrity
   */
  static verifyHashChain(hashes: string[], data: any[]): boolean {
    if (hashes.length !== data.length + 1) {
      return false
    }

    let currentHash = hashes[0] // Genesis hash
    
    for (let i = 0; i < data.length; i++) {
      const expectedHash = this.createHashChain(currentHash, data[i])
      if (expectedHash !== hashes[i + 1]) {
        return false
      }
      currentHash = hashes[i + 1]
    }

    return true
  }

  /**
   * Creates digital signature for data
   * In production, use proper private key management
   */
  static signData(data: any, privateKey?: string): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data)
    
    // For development/demo purposes - in production use proper key management
    const devPrivateKey = privateKey || process.env.SIGNING_PRIVATE_KEY || 'dev-private-key'
    
    try {
      const sign = createSign('SHA256')
      sign.update(dataString)
      return sign.sign(devPrivateKey, 'hex')
    } catch (error) {
      // Fallback to simple hash for demo purposes
      return this.createHash(`${devPrivateKey}:${dataString}`)
    }
  }

  /**
   * Verifies digital signature
   */
  static verifySignature(data: any, signature: string, publicKey?: string): boolean {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data)
    
    // For development/demo purposes
    const devPublicKey = publicKey || process.env.SIGNING_PUBLIC_KEY || 'dev-public-key'
    
    try {
      const verify = createVerify('SHA256')
      verify.update(dataString)
      return verify.verify(devPublicKey, signature, 'hex')
    } catch (error) {
      // Fallback verification for demo purposes
      const expectedSignature = this.createHash(`dev-private-key:${dataString}`)
      return signature === expectedSignature
    }
  }

  /**
   * Generates unique certificate ID
   */
  static generateCertificateId(): string {
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2)
    return this.createHash(`${timestamp}:${random}`).substring(0, 16).toUpperCase()
  }
}