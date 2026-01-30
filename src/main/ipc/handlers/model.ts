import { IpcMainInvokeEvent } from 'electron'
import { Model as PrismaModel, Prisma } from '@prisma/client'
import { DatabaseService } from '../../services/database'
import { Model as DomainModel } from '../../../types/domain'
import { SecureStorageService, maskApiKey } from '../../services/secure-storage.service'
import { modelCreateSchema, modelUpdateSchema } from '../validators'

type ModelCreateInput = Omit<DomainModel, 'id'>
type ModelUpdateInput = {
  id: DomainModel['id']
  data: Partial<Omit<DomainModel, 'id'>>
}

export async function handleModelCreate(
  _event: IpcMainInvokeEvent,
  input: ModelCreateInput
): Promise<PrismaModel> {
  const validation = modelCreateSchema.safeParse(input)
  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.message}`)
  }

  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()

  // Encrypt API key before storage
  const encryptedApiKey = input.apiKey ? secureStorage.encrypt(input.apiKey) : null

  const createdRecord = await prisma.model.create({
    data: {
      provider: input.provider,
      modelName: input.modelName,
      apiKey: encryptedApiKey,
      baseURL: input.baseURL,
      config: input.config
    }
  })

  // Return masked API key to renderer
  return {
    ...createdRecord,
    apiKey: createdRecord.apiKey ? maskApiKey(input.apiKey || '') : null
  }
}

export async function handleModelList(_event: IpcMainInvokeEvent): Promise<PrismaModel[]> {
  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()
  const models = await prisma.model.findMany()

  return models.map(model => ({
    ...model,
    apiKey: model.apiKey ? maskApiKey(secureStorage.decrypt(model.apiKey)) : null
  }))
}

export async function handleModelUpdate(
  _event: IpcMainInvokeEvent,
  input: ModelUpdateInput
): Promise<PrismaModel> {
  const validation = modelUpdateSchema.safeParse(input)
  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.message}`)
  }

  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()
  const { id, data } = input

  const updateData: Prisma.ModelUpdateInput = {
    ...data,
    config: data.config ?? undefined
  }

  if (data.apiKey) {
    updateData.apiKey = secureStorage.encrypt(data.apiKey)
  }

  const updatedRecord = await prisma.model.update({
    where: { id },
    data: updateData
  })

  // Return masked API key to renderer. If we didn't update it, we need to decrypt what's in DB to mask it correctly.
  const decryptedKey = updatedRecord.apiKey ? secureStorage.decrypt(updatedRecord.apiKey) : ''

  return {
    ...updatedRecord,
    apiKey: updatedRecord.apiKey ? maskApiKey(decryptedKey) : null
  }
}

export async function handleModelDelete(
  _event: IpcMainInvokeEvent,
  id: DomainModel['id']
): Promise<PrismaModel> {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid model ID')
  }

  const prisma = DatabaseService.getInstance().getClient()
  const deletedRecord = await prisma.model.delete({ where: { id } })
  return deletedRecord
}

export async function handleModelGetApiKey(id: DomainModel['id']): Promise<string | null> {
  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()

  const model = await prisma.model.findUnique({ where: { id } })

  if (!model || !model.apiKey) {
    return null
  }

  return secureStorage.decrypt(model.apiKey)
}
