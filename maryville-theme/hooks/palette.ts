/**
 * The Maryville look: two palettes, the tool kinds they color, and the pure
 * helpers the drawing hooks use. Nothing here touches `$`.
 */

export type Mode = 'dark' | 'light'
export type Kind = 'read' | 'write' | 'run' | 'search' | 'web' | 'mcp'

export type Palette = {
  /** Brand red: the rail, the prompt marker, the running state. */
  accent: string
  /** A lighter red for shimmer and secondary accents. */
  accentSoft: string
  /** Brand maroon, used on light backgrounds where the red is too bright. */
  maroon: string
  fg: string
  muted: string
  /** The tint behind the person's own messages and card headers. */
  surface: string
  ok: string
  err: string
  warn: string
  read: string
  write: string
  run: string
  search: string
  web: string
  mcp: string
}

export const PALETTES: Record<Mode, Palette> = {
  dark: {
    accent: '#ce2431',
    accentSoft: '#e8616b',
    maroon: '#94151e',
    fg: '#e6e6e6',
    muted: '#9a9b9d',
    surface: '#2b1114',
    ok: '#7fb069',
    err: '#ff6b6b',
    warn: '#e9b949',
    read: '#c4c5c7',
    write: '#e8616b',
    run: '#ce2431',
    search: '#e0b04f',
    web: '#8fb3d9',
    mcp: '#c39bd3',
  },
  light: {
    accent: '#94151e',
    accentSoft: '#ce2431',
    maroon: '#94151e',
    fg: '#262626',
    muted: '#5a5a5a',
    surface: '#f6e7e8',
    ok: '#2f7d32',
    err: '#b3261e',
    warn: '#9a6700',
    read: '#5a5a5a',
    write: '#ce2431',
    run: '#94151e',
    search: '#8a5a00',
    web: '#1f5f9e',
    mcp: '#6b3fa0',
  },
}

/** Which palette a Claude Code theme preference calls for. */
export function modeOf(theme: unknown): Mode {
  return typeof theme === 'string' && theme.includes('light') ? 'light' : 'dark'
}

const KINDS: Record<string, Kind> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'run',
  PowerShell: 'run',
  Glob: 'search',
  Grep: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
}

/**
 * The kind a tool row is colored by, or null for the rows left to Claude Code
 * (agents, plan mode, questions, todo lists: they have live progress and
 * dialogs of their own).
 */
export function kindOf(tool: string): Kind | null {
  if (tool.startsWith('mcp__')) return 'mcp'
  return KINDS[tool] ?? null
}

export const ICONS: Record<Kind, string> = {
  read: '◇',
  write: '✎',
  run: '❯',
  search: '⌕',
  web: '⟡',
  mcp: '⚙',
}

/** `mcp__github__search_code` reads as `github:search_code`; others as named. */
export function label(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const [, server, ...rest] = tool.split('__')
  return rest.length ? `${server}:${rest.join('_')}` : server
}

const MAX_TARGET = 120

function firstString(input: Record<string, unknown>): string {
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TARGET ? flat.slice(0, MAX_TARGET - 1) + '…' : flat
}

/** Shortens an absolute path to its last two segments. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : parts.join('/')
}

/** The one thing worth a glance about a call: its file, command, pattern or query. */
export function summarize(tool: string, input: unknown): string {
  const fields: Record<string, unknown> =
    typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const str = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : '')
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return oneLine(str('command'))
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return shortPath(str('file_path'))
    case 'NotebookEdit':
    case 'NotebookRead':
      return shortPath(str('notebook_path'))
    case 'Glob':
      return oneLine(str('pattern'))
    case 'Grep':
      return oneLine(str('path') ? `${str('pattern')} in ${shortPath(str('path'))}` : str('pattern'))
    case 'WebFetch':
      return oneLine(str('url').replace(/^https?:\/\//, ''))
    case 'WebSearch':
      return oneLine(str('query'))
    default:
      return oneLine(firstString(fields))
  }
}

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

/** The hunks an Edit or Write result carries, as one unified diff `Code` draws. */
export function diffSource(hunks: readonly Hunk[]): string {
  return hunks
    .map(h => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join('\n')}`)
    .join('\n')
}

export function diffCounts(hunks: readonly Hunk[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const h of hunks) {
    for (const line of h.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

/** Reads the hunks off a tool result, or none when it carries no patch. */
export function hunksOf(output: unknown): Hunk[] {
  if (typeof output !== 'object' || output === null) return []
  const patch = (output as { structuredPatch?: unknown }).structuredPatch
  if (!Array.isArray(patch)) return []
  return patch.filter(
    (h): h is Hunk =>
      typeof h === 'object' && h !== null && Array.isArray((h as Hunk).lines) && typeof (h as Hunk).oldStart === 'number',
  )
}

/** The first `max` lines of a text and how many it left out. */
export function fold(text: string, max: number): { lines: string[]; hidden: number } {
  const all = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (all.length === 1 && all[0] === '') return { lines: [], hidden: 0 }
  return { lines: all.slice(0, max), hidden: Math.max(0, all.length - max) }
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const m = Math.floor(ms / 60_000)
  return `${m}m ${Math.round((ms % 60_000) / 1000)}s`
}

/** "We Power Dreams, Not Just Degrees": the words the spinner and turn line use. */
export const SPINNER_WORDS = ['Powering', 'Dreaming', 'Rallying', 'Charting', 'Climbing', 'Blazing', 'Soaring'] as const
export const DONE_WORDS = ['Powered', 'Dreamed', 'Rallied', 'Charted', 'Climbed', 'Soared'] as const

/** One word per seed, stable for the seed, so a turn keeps its word. */
export function wordFor(words: readonly string[], seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return words[h % words.length]
}

/** A 10-cell meter of `percent` filled. */
export function meter(percent: number, width = 10): string {
  const p = Math.max(0, Math.min(100, percent))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
