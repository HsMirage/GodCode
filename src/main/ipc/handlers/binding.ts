/**
 * Agent 和 Category 绑定 IPC Handler
 */

import { IpcMainInvokeEvent } from 'electron'
import {
  BindingService,
  type UpdateAgentBindingInput,
  type UpdateCategoryBindingInput
} from '../../services/binding.service'
import { DatabaseService } from '../../services/database'

const bindingService = BindingService.getInstance()

// ========== Agent Binding Handlers ==========

export async function handleAgentBindingList(_event: IpcMainInvokeEvent) {
  const db = DatabaseService.getInstance()
  await db.init()
  return await bindingService.listAgentBindings()
}

export async function handleAgentBindingGet(_event: IpcMainInvokeEvent, agentCode: string) {
  return await bindingService.getAgentBinding(agentCode)
}

export async function handleAgentBindingUpdate(
  event: IpcMainInvokeEvent,
  params: { agentCode: string; data: UpdateAgentBindingInput }
) {
  return await bindingService.updateAgentBinding(params.agentCode, params.data, {
    sessionId: event.sender?.id ? String(event.sender.id) : undefined
  })
}

export async function handleAgentBindingReset(event: IpcMainInvokeEvent, agentCode: string) {
  return await bindingService.resetAgentBinding(agentCode, {
    sessionId: event.sender?.id ? String(event.sender.id) : undefined
  })
}

// ========== Category Binding Handlers ==========

export async function handleCategoryBindingList(_event: IpcMainInvokeEvent) {
  const db = DatabaseService.getInstance()
  await db.init()
  return await bindingService.listCategoryBindings()
}

export async function handleCategoryBindingGet(_event: IpcMainInvokeEvent, categoryCode: string) {
  return await bindingService.getCategoryBinding(categoryCode)
}

export async function handleCategoryBindingUpdate(
  event: IpcMainInvokeEvent,
  params: { categoryCode: string; data: UpdateCategoryBindingInput }
) {
  return await bindingService.updateCategoryBinding(params.categoryCode, params.data, {
    sessionId: event.sender?.id ? String(event.sender.id) : undefined
  })
}

export async function handleCategoryBindingReset(event: IpcMainInvokeEvent, categoryCode: string) {
  return await bindingService.resetCategoryBinding(categoryCode, {
    sessionId: event.sender?.id ? String(event.sender.id) : undefined
  })
}
