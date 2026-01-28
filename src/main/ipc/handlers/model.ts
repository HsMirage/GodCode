import { IpcMainInvokeEvent } from 'electron'
import { Model as PrismaModel } from '@prisma/client'
import { DatabaseService } from '../../services/database'
import { Model as DomainModel } from '../../../types/domain'

type ModelCreateInput = Omit<DomainModel, 'id'>
type ModelUpdateInput = {
  id: DomainModel['id']
  data: Partial<Omit<DomainModel, 'id'>>
}

export async function handleModelCreate(
  _event: IpcMainInvokeEvent,
  input: ModelCreateInput
): Promise<PrismaModel> {
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
  return createdRecord
}

export async function handleModelList(_event: IpcMainInvokeEvent): Promise<PrismaModel[]> {
  const prisma = DatabaseService.getInstance().getClient()
  const models = await prisma.model.findMany()
  return models
}

export async function handleModelUpdate(
  _event: IpcMainInvokeEvent,
  input: ModelUpdateInput
): Promise<PrismaModel> {
  const prisma = DatabaseService.getInstance().getClient()
  const { id, data } = input

  const updatedRecord = await prisma.model.update({
    where: { id },
    data: {
      ...data,
      config: data.config ?? undefined
    }
  })
  return updatedRecord
}

export async function handleModelDelete(
  _event: IpcMainInvokeEvent,
  id: DomainModel['id']
): Promise<PrismaModel> {
  const prisma = DatabaseService.getInstance().getClient()
  const deletedRecord = await prisma.model.delete({ where: { id } })
  return deletedRecord
}
