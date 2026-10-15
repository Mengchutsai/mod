export type Question = { requestId: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'my-questions': { questions: Question[] }
  }
}
