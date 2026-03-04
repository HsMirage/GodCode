import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { AgentBindingData } from '../../../src/renderer/types/binding'
import type { Model } from '../../../src/types/domain'
import { AgentCard } from '../../../src/renderer/src/components/settings/AgentCard'

const baseAgent: AgentBindingData = {
  id: 'fuxi',
  agentCode: 'fuxi',
  agentName: '伏羲(FuXi)',
  agentType: 'primary',
  description: '战略规划器',
  modelId: null,
  modelName: null,
  temperature: 0.3,
  tools: ['read'],
  systemPrompt: null,
  enabled: true
}

const models: Model[] = [
  {
    id: 'model-1',
    provider: 'anthropic',
    modelName: 'claude-opus-4-6',
    config: {}
  },
  {
    id: 'model-2',
    provider: 'openai',
    modelName: 'gpt-4o-mini',
    config: {}
  }
]

describe('<AgentCard /> preset quick switch', () => {
  it('applies mapped preset defaults from quick switch action', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const onReset = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <AgentCard
        agent={baseAgent}
        models={models}
        providerNameByModelId={{ 'model-1': 'Anthropic', 'model-2': 'OpenAI' }}
        onUpdate={onUpdate}
        onReset={onReset}
      />
    )

    await user.click(screen.getByText('伏羲(FuXi)'))

    const plannerButton = await screen.findByRole('button', { name: 'Planner' })
    await user.click(plannerButton)

    expect(onUpdate).toHaveBeenCalledWith('fuxi', {
      modelId: 'model-1',
      temperature: 0.3,
      tools: ['read', 'write', 'edit', 'bash', 'webfetch', 'look_at']
    })
  })

  it('does not render preset quick switch for agents without mapped preset', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const onReset = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <AgentCard
        agent={{ ...baseAgent, id: 'haotian', agentCode: 'haotian', agentName: '昊天(HaoTian)' }}
        models={models}
        providerNameByModelId={{ 'model-1': 'Anthropic', 'model-2': 'OpenAI' }}
        onUpdate={onUpdate}
        onReset={onReset}
      />
    )

    await user.click(screen.getByText('昊天(HaoTian)'))

    expect(screen.queryByText('角色预设')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Planner' })).not.toBeInTheDocument()
  })
})
