export type Snapshot = {
  tokens?: number
  window: number
  percent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-buddy': { snapshot: Snapshot | null }
  }
}
