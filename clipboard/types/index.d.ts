/** One kept snippet: its text (markdown), where it came from, and when. */
export type Clip = {
  id: number
  text: string
  from: 'selection' | 'answer' | 'note'
  /** ISO timestamp of when it was kept. */
  at: string
}

declare module 'claude-code' {
  interface PluginState {
    clipboard: {
      clips: Clip[]
      /** The main loop's last answer, kept so "Keep last answer" has it. */
      lastAnswer: string | null
      /** The one-line status shown at the top of the pane after an action. */
      note: string | null
      /** The session's project root; clips are filed in the store under it, one list per project. */
      project: string | null
    }
  }
}
