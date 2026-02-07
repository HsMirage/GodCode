import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'

type BackfillEntry = {
  modelId: string
  modelName: string
  provider: string
  baseURL?: string
  apiKeyId?: string
  fingerprint?: string
  status: 'migrated' | 'skipped' | 'failed'
  reason?: string
}

type BackfillReport = {
  startedAt: string
  finishedAt?: string
  durationMs?: number
  encryptionMode: 'safeStorage' | 'plaintext-fallback'
  totals: {
    totalModels: number
    migrated: number
    skipped: number
    failed: number
  }
  entries: BackfillEntry[]
  fatalError?: string
}

type EncryptionContext = {
  mode: 'safeStorage' | 'plaintext-fallback'
  encrypt: (plaintext: string) => string
  decrypt: (ciphertext: string) => string
}

type ApiKeyBucketItem = {
  id: string
  fingerprint: string
  decryptedKey: string
}

const REPORT_PATH = path.resolve(process.cwd(), '.sisyphus/evidence/task-4-backfill-report.json')

const fingerprint = (apiKey: string): string =>
  createHash('sha256').update(apiKey).digest('hex').slice(0, 16)

const tupleKey = (provider: string, baseURL: string, apiKeyFp: string): string =>
  `${provider}::${baseURL}::${apiKeyFp}`

/**
 * 与 src/main/services/secure-storage.service.ts 的 encrypt/decrypt 逻辑保持一致：
 * 1) safeStorage 可用 -> base64(cipher)
 * 2) safeStorage 不可用 -> 明文回退
 */
async function createEncryptionContext(): Promise<EncryptionContext> {
  try {
    const electronMod = (await import('electron')) as {
      safeStorage?: {
        isEncryptionAvailable?: () => boolean
        encryptString?: (plaintext: string) => Buffer
        decryptString?: (buffer: Buffer) => string
      }
    }

    const safeStorage = electronMod.safeStorage
    const available = !!safeStorage?.isEncryptionAvailable?.()

    if (
      available &&
      typeof safeStorage?.encryptString === 'function' &&
      typeof safeStorage?.decryptString === 'function'
    ) {
      return {
        mode: 'safeStorage',
        encrypt: (plaintext: string) => {
          if (!plaintext) return ''
          return safeStorage.encryptString!(plaintext).toString('base64')
        },
        decrypt: (ciphertext: string) => {
          if (!ciphertext) return ''
          try {
            return safeStorage.decryptString!(Buffer.from(ciphertext, 'base64'))
          } catch {
            // 与项目逻辑一致：解密失败时回退原文
            return ciphertext
          }
        }
      }
    }
  } catch {
    // 在纯 Node 环境 import('electron') 可能不可用，走明文回退。
  }

  return {
    mode: 'plaintext-fallback',
    encrypt: (plaintext: string) => plaintext,
    decrypt: (ciphertext: string) => ciphertext
  }
}

async function writeReport(report: BackfillReport): Promise<void> {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8')
}

async function main(): Promise<void> {
  const startedAt = new Date()
  const report: BackfillReport = {
    startedAt: startedAt.toISOString(),
    encryptionMode: 'plaintext-fallback',
    totals: {
      totalModels: 0,
      migrated: 0,
      skipped: 0,
      failed: 0
    },
    entries: []
  }

  let prisma: PrismaClient | null = null

  try {
    const cryptoCtx = await createEncryptionContext()
    report.encryptionMode = cryptoCtx.mode

    prisma = new PrismaClient()
    await prisma.$connect()

    const models = await prisma.model.findMany({
      select: {
        id: true,
        provider: true,
        modelName: true,
        apiKey: true,
        baseURL: true,
        apiKeyId: true
      }
    })

    report.totals.totalModels = models.length

    // 幂等关键：先读取“已链接 model”的三元组映射，优先复用已有 apiKeyId。
    const linkedTupleToApiKeyId = new Map<string, string>()
    for (const model of models) {
      if (!model.apiKeyId || !model.apiKey || !model.baseURL) continue
      const fp = fingerprint(model.apiKey)
      linkedTupleToApiKeyId.set(tupleKey(model.provider, model.baseURL, fp), model.apiKeyId)
    }

    const apiKeyBucketCache = new Map<string, ApiKeyBucketItem[]>()

    const loadBucket = async (provider: string, baseURL: string): Promise<ApiKeyBucketItem[]> => {
      const bucketKey = `${provider}::${baseURL}`
      const cached = apiKeyBucketCache.get(bucketKey)
      if (cached) return cached

      const rows = await prisma!.apiKey.findMany({
        where: { provider, baseURL },
        select: { id: true, encryptedKey: true }
      })

      const parsed: ApiKeyBucketItem[] = rows.map(row => {
        const decrypted = cryptoCtx.decrypt(row.encryptedKey)
        return {
          id: row.id,
          decryptedKey: decrypted,
          fingerprint: fingerprint(decrypted)
        }
      })

      apiKeyBucketCache.set(bucketKey, parsed)
      return parsed
    }

    for (const model of models) {
      const provider = model.provider
      const modelName = model.modelName

      if (model.apiKeyId) {
        report.totals.skipped += 1
        report.entries.push({
          modelId: model.id,
          modelName,
          provider,
          baseURL: model.baseURL ?? undefined,
          apiKeyId: model.apiKeyId,
          status: 'skipped',
          reason: 'already-linked'
        })
        continue
      }

      if (!model.apiKey || !model.baseURL) {
        report.totals.skipped += 1
        report.entries.push({
          modelId: model.id,
          modelName,
          provider,
          baseURL: model.baseURL ?? undefined,
          status: 'skipped',
          reason: 'missing-legacy-apiKey-or-baseURL'
        })
        continue
      }

      const currentFp = fingerprint(model.apiKey)
      const key3Tuple = tupleKey(provider, model.baseURL, currentFp)

      try {
        let targetApiKeyId = linkedTupleToApiKeyId.get(key3Tuple)

        if (!targetApiKeyId) {
          const bucket = await loadBucket(provider, model.baseURL)
          const matched = bucket.find(
            item => item.fingerprint === currentFp || item.decryptedKey === model.apiKey
          )
          if (matched) {
            targetApiKeyId = matched.id
          }
        }

        if (!targetApiKeyId) {
          const encryptedKey = cryptoCtx.encrypt(model.apiKey)
          const created = await prisma.apiKey.create({
            data: {
              provider,
              baseURL: model.baseURL,
              encryptedKey,
              label: null
            },
            select: { id: true }
          })

          targetApiKeyId = created.id

          const bucket = await loadBucket(provider, model.baseURL)
          bucket.push({
            id: created.id,
            decryptedKey: model.apiKey,
            fingerprint: currentFp
          })
        }

        await prisma.model.updateMany({
          where: { id: model.id, apiKeyId: null },
          data: { apiKeyId: targetApiKeyId }
        })

        linkedTupleToApiKeyId.set(key3Tuple, targetApiKeyId)
        report.totals.migrated += 1
        report.entries.push({
          modelId: model.id,
          modelName,
          provider,
          baseURL: model.baseURL,
          apiKeyId: targetApiKeyId,
          fingerprint: currentFp,
          status: 'migrated'
        })
      } catch (error) {
        report.totals.failed += 1
        report.entries.push({
          modelId: model.id,
          modelName,
          provider,
          baseURL: model.baseURL,
          fingerprint: currentFp,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
  } catch (error) {
    report.fatalError = error instanceof Error ? error.message : String(error)
    report.totals.failed += 1
    process.exitCode = 1
  } finally {
    report.finishedAt = new Date().toISOString()
    report.durationMs = Date.now() - startedAt.getTime()

    if (prisma) {
      await prisma.$disconnect()
    }

    await writeReport(report)

    console.log('[Task-4 Backfill] migration report written to:', REPORT_PATH)
    console.log(
      '[Task-4 Backfill] totals:',
      JSON.stringify(report.totals),
      'encryptionMode=',
      report.encryptionMode
    )

    if (report.fatalError) {
      console.error('[Task-4 Backfill] fatal:', report.fatalError)
    }
  }
}

void main()
