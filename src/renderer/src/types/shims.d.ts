declare module '../../types/domain' {
  export * from '../../../types/domain'
}

interface Window {
  codeall: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }
}
