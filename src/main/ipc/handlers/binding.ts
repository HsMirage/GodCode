/**
 * Agent 和 Category 绑定 IPC Handler
 */

import { IpcMainInvokeEvent } from 'electron'
import {
  BindingService,
  type UpdateAgentBindingInput,
  type UpdateCategoryBindingInput
} from '../../services/binding.service'

const bindingService = BindingService.getInstance()

// ========== Agent Binding Handlers ==========

export async function handleAgentBindingList(_event: IpcMainInvokeEvent) {
  return await bindingService.listAgentBindings()
}

export async function handleAgentBindingGet(_event: IpcMainInvokeEvent, agentCode: string) {
  return await bindingService.getAgentBinding(agentCode)
}

export async function handleAgentBindingUpdate(
  _event: IpcMainInvokeEvent,
  params: { agentCode: string; data: UpdateAgentBindingInput }
) {
  return await bindingService.updateAgentBinding(params.agentCode, params.data)
}

export async function handleAgentBindingReset(_event: IpcMainInvokeEvent, agentCode: string) {
  return await bindingService.resetAgentBinding(agentCode)
}

// ========== Category Binding Handlers ==========

export async function handleCategoryBindingList(_event: IpcMainInvokeEvent) {
  return await bindingService.listCategoryBindings()
}

export async function handleCategoryBindingGet(_event: IpcMainInvokeEvent, categoryCode: string) {
  return await bindingService.getCategoryBinding(categoryCode)
}

export async function handleCategoryBindingUpdate(
  _event: IpcMainInvokeEvent,
  params: { categoryCode: string; data: UpdateCategoryBindingInput }
) {
  return await bindingService.updateCategoryBinding(params.categoryCode, params.data)
}

export async function handleCategoryBindingReset(_event: IpcMainInvokeEvent, categoryCode: string) {
  return await bindingService.resetCategoryBinding(categoryCode)
}
