import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '@/shared/logger'

interface UsageRecord {
  date: string
  provider: string
  promptTokens: number
  completionTokens: number
  cost: number
}

const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15
const TOKENS_PER_MILLION = 1_000_000
const DEFAULT_DAILY_LIMIT = 10
const WARNING_THRESHOLD = 0.8

export class CostTracker {
  private static instance: CostTracker
  private usageFile: string
  private records: UsageRecord[] = []

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.usageFile = path.join(userDataPath, 'usage.json')
    this.loadRecords()
  }

  static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker()
    }
    return CostTracker.instance
  }

  trackUsage(provider: string, promptTokens: number, completionTokens: number): void {
    const safePrompt = Math.max(0, Math.floor(promptTokens))
    const safeCompletion = Math.max(0, Math.floor(completionTokens))
    const cost = this.calculateCost(safePrompt, safeCompletion)

    this.pruneToToday()
    this.records.push({
      date: this.getTodayKey(),
      provider,
      promptTokens: safePrompt,
      completionTokens: safeCompletion,
      cost
    })

    this.saveRecords()
    this.warnIfApproachingLimit(DEFAULT_DAILY_LIMIT)
  }

  getDailyCost(): number {
    this.pruneToToday()
    return this.records.reduce((total, record) => total + record.cost, 0)
  }

  checkBudget(dailyLimit: number = DEFAULT_DAILY_LIMIT): void {
    const total = this.getDailyCost()
    if (total > dailyLimit) {
      throw new Error(
        `Daily LLM budget exceeded: $${total.toFixed(2)} > $${dailyLimit.toFixed(2)}`
      )
    }
  }

  reset(): void {
    this.records = []
    this.saveRecords()
  }

  private calculateCost(promptTokens: number, completionTokens: number): number {
    const inputCost = (promptTokens / TOKENS_PER_MILLION) * INPUT_COST_PER_MILLION
    const outputCost = (completionTokens / TOKENS_PER_MILLION) * OUTPUT_COST_PER_MILLION
    return inputCost + outputCost
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private pruneToToday(): void {
    const today = this.getTodayKey()
    this.records = this.records.filter((record) => record?.date === today)
  }

  private loadRecords(): void {
    try {
      if (!fs.existsSync(this.usageFile)) {
        this.records = []
        return
      }

      const raw = fs.readFileSync(this.usageFile, 'utf-8')
      const parsed = JSON.parse(raw)
      this.records = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      this.records = []
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('CostTracker failed to load usage data', { error: message })
    }

    this.pruneToToday()
  }

  private saveRecords(): void {
    try {
      const dir = path.dirname(this.usageFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.usageFile, JSON.stringify(this.records, null, 2), 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('CostTracker failed to persist usage data', { error: message })
    }
  }

  private warnIfApproachingLimit(dailyLimit: number): void {
    if (dailyLimit <= 0) {
      return
    }

    const total = this.getDailyCost()
    if (total >= dailyLimit * WARNING_THRESHOLD && total <= dailyLimit) {
      logger.warn('Approaching daily LLM budget limit', {
        total: total.toFixed(2),
        dailyLimit: dailyLimit.toFixed(2)
      })
    }
  }
}

export const costTracker = CostTracker.getInstance()
