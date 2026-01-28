export interface CategoryConfig {
  model: string
  temperature: number
}

export const categories: Record<string, CategoryConfig> = {
  quick: {
    model: 'claude-3-haiku-20240307',
    temperature: 0.3
  },
  'visual-engineering': {
    model: 'gemini-pro',
    temperature: 0.7
  },
  ultrabrain: {
    model: 'gpt-4',
    temperature: 0.2
  },
  'unspecified-low': {
    model: 'claude-3-haiku-20240307',
    temperature: 0.5
  },
  'unspecified-high': {
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.5
  },
  artistry: {
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.8
  },
  writing: {
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.6
  }
}
