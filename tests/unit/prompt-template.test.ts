import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data'
  }
}))

import { PromptTemplateService } from '@/main/services/prompt-template.service'

describe('PromptTemplateService', () => {
  describe('extractVariables', () => {
    it('should extract variables from template', () => {
      const service = new PromptTemplateService()
      const content = 'Hello {name}, you are {age} years old'
      const variables = service.extractVariables(content)

      expect(variables).toContain('name')
      expect(variables).toContain('age')
      expect(variables).toHaveLength(2)
    })

    it('should handle templates without variables', () => {
      const service = new PromptTemplateService()
      const content = 'Hello world'
      const variables = service.extractVariables(content)

      expect(variables).toHaveLength(0)
    })

    it('should deduplicate variables', () => {
      const service = new PromptTemplateService()
      const content = '{name} and {name} again'
      const variables = service.extractVariables(content)

      expect(variables).toHaveLength(1)
    })
  })

  describe('renderTemplate', () => {
    it('should replace variables', () => {
      const service = new PromptTemplateService()
      const template = {
        id: 'test',
        name: 'Test',
        content: 'Hello {name}, you are {age}',
        variables: ['name', 'age'],
        category: 'user' as const,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const rendered = service.renderTemplate(template, {
        name: 'Alice',
        age: '30'
      })

      expect(rendered).toBe('Hello Alice, you are 30')
    })

    it('should handle missing variables', () => {
      const service = new PromptTemplateService()
      const template = {
        id: 'test',
        name: 'Test',
        content: 'Hello {name}',
        variables: ['name'],
        category: 'user' as const,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const rendered = service.renderTemplate(template, {})

      expect(rendered).toContain('{name}')
    })
  })
})
