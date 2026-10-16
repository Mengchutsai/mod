export type Usage = {
  tokens?: number
  window: number
  percent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'maryville-theme': {
      /** Which palette the drawings use, from the Claude Code theme setting. */
      mode: 'dark' | 'light'
      /** Whether the mod draws at all; off restores Claude Code's own drawing. */
      isOn: boolean
      /** Whether the usage band above the prompt is drawn. */
      band: boolean
      usage: Usage | null
    }
  }
}
