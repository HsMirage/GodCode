import { IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../services/database'
import { Model } from '../../../types/domain'

type ModelCreateInput = Omit<Model, 'id'>
type ModelUpdateInput = {
  id: Model['id']
  data: Partial<Omit<Model, 'id'>>
}

const modelProviders: Model['provider'][] = [
  'anthropic',
  'openai',
  'google',
  'ollama',
  'openai-compat'
]

function toModelProvider(provider: string): Model['provider'] {
  if (modelProviders.includes(provider as Model['provider'])) {
    return provider as Model['provider']
  }
  throw new Error(`Unsupported model provider: ${provider}`)
}

function toDomainModel(record: {
  id: string
  provider: string
  modelName: string
  apiKey: string | null
  baseURL: string | null
  config: unknown
}): Model {
  return {
    id: record.id,
    provider: toModelProvider(record.provider),
    modelName: record.modelName,
    apiKey: record.apiKey ?? undefined,
    baseURL: record.baseURL ?? undefined,
    config: record.config as Model['config']
  }
}

export async function handleModelCreate(
  _event: IpcMainInvokeEvent,
  input: ModelCreateInput
): Promise<Model> {
  const prisma = DatabaseService.getInstance().getClient()
  const createdRecord = await prisma.model.create({
    data: {
      provider: input.provider,
      modelName: input.modelName,
      apiKey: input.apiKey,
      baseURL: input.baseURL,
      config: input.config
    }
  })
  return toDomainModel(createdRecord)
}

export async function handleModelList(_event: IpcMainInvokeEvent): Promise<Model[]> {
  const prisma = DatabaseService.getInstance().getClient()
  const models = await prisma.model.findMany()
  return models.map(toDomainModel)
}

export async function handleModelUpdate(
  _event: IpcMainInvokeEvent,
  input: ModelUpdateInput
): Promise<Model> {
  const prisma = DatabaseService.getInstance().getClient()
  const { id, data } = input

  const updatedRecord = await prisma.model.update({
    where: { id },
    data: {
      ...data,
      config: data.config ?? undefined
    }
  })
  return toDomainModel(updatedRecord)
}

export async function handleModelDelete(
  _event: IpcMainInvokeEvent,
  id: Model['id']
): Promise<Model> {
  const prisma = DatabaseService.getInstance().getClient()
  const deletedRecord = await prisma.model.delete({ where: { id } })
  return toDomainModel(deletedRecord)
}
