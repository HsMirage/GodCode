import { OpenAIAdapter } from './openai.adapter'

export class OpenAICompatAdapter extends OpenAIAdapter {
  constructor(apiKey: string, baseURL: string) {
    if (!baseURL) {
      throw new Error('baseURL is required for OpenAI-compatible adapter')
    }
    super(apiKey, baseURL)
  }
}
