import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { LoggerService } from './logger'

export interface PromptTemplate {
  id: string
  name: string
  content: string
  variables: string[]
  category: 'system' | 'user' | 'custom'
  version: number
  createdAt: Date
  updatedAt: Date
}

export class PromptTemplateService {
  private logger = LoggerService.getInstance().getLogger()
  private templatesDir: string

  constructor() {
    this.templatesDir = path.join(app.getPath('userData'), 'prompts')
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.templatesDir, { recursive: true })
      await fs.mkdir(path.join(this.templatesDir, 'system'), { recursive: true })
      await fs.mkdir(path.join(this.templatesDir, 'user'), { recursive: true })
      await fs.mkdir(path.join(this.templatesDir, 'custom'), { recursive: true })

      await this.createDefaultTemplates()

      this.logger.info('Prompt template service initialized', {
        templatesDir: this.templatesDir
      })
    } catch (error) {
      this.logger.error('Failed to initialize prompt templates', error)
      throw error
    }
  }

  async saveTemplate(
    template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PromptTemplate> {
    try {
      const id = this.generateId(template.name)
      const now = new Date()

      const fullTemplate: PromptTemplate = {
        ...template,
        id,
        createdAt: now,
        updatedAt: now
      }

      const filePath = this.getTemplatePath(template.category, id)
      await fs.writeFile(filePath, JSON.stringify(fullTemplate, null, 2), 'utf-8')

      this.logger.info('Template saved', { id, name: template.name })
      return fullTemplate
    } catch (error) {
      this.logger.error('Failed to save template', error)
      throw error
    }
  }

  async getTemplate(category: string, id: string): Promise<PromptTemplate | null> {
    try {
      const filePath = this.getTemplatePath(category, id)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as PromptTemplate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      this.logger.error('Failed to get template', error)
      throw error
    }
  }

  async listTemplates(category?: string): Promise<PromptTemplate[]> {
    try {
      const categories = category ? [category] : ['system', 'user', 'custom']
      const templates: PromptTemplate[] = []

      for (const cat of categories) {
        const dirPath = path.join(this.templatesDir, cat)
        try {
          const files = await fs.readdir(dirPath)
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(dirPath, file)
              const content = await fs.readFile(filePath, 'utf-8')
              templates.push(JSON.parse(content))
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
          }
        }
      }

      return templates.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      this.logger.error('Failed to list templates', error)
      throw error
    }
  }

  renderTemplate(template: PromptTemplate, variables: Record<string, string>): string {
    let rendered = template.content

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g')
      rendered = rendered.replace(regex, value)
    }

    const unreplacedVars = rendered.match(/\{[^}]+\}/g)
    if (unreplacedVars) {
      this.logger.warn('Template has unreplaced variables', {
        template: template.name,
        unreplacedVars
      })
    }

    return rendered
  }

  async deleteTemplate(category: string, id: string): Promise<boolean> {
    try {
      const filePath = this.getTemplatePath(category, id)
      await fs.unlink(filePath)
      this.logger.info('Template deleted', { category, id })
      return true
    } catch (error) {
      this.logger.error('Failed to delete template', error)
      return false
    }
  }

  extractVariables(content: string): string[] {
    const matches = content.match(/\{([^}]+)\}/g) || []
    return [...new Set(matches.map(m => m.slice(1, -1)))]
  }

  private getTemplatePath(category: string, id: string): string {
    return path.join(this.templatesDir, category, `${id}.json`)
  }

  private generateId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now()
  }

  private async createDefaultTemplates(): Promise<void> {
    const defaultTemplate: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Default System Prompt',
      content:
        'You are a helpful AI assistant named {assistantName}. Answer questions clearly and concisely.',
      variables: ['assistantName'],
      category: 'system',
      version: 1
    }

    const exists = await this.getTemplate('system', this.generateId(defaultTemplate.name))
    if (!exists) {
      await this.saveTemplate(defaultTemplate)
    }
  }
}

export const promptTemplateService = new PromptTemplateService()
