import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Clip } from '../types'

const PANE = 'clipboard'
const TITLE = 'Clipboard'
const MAX_CLIPS = 200
const EXPORT_FILE = 'clipboard.md'

/** The keep pill's color: university red, as an outline, readable on light and dark alike. */
const MARYVILLE_RED = '#ce2431'

const clips = atom({ plugin: 'clipboard', key: 'clips' } as const, [] as Clip[])
const lastAnswer = atom({ plugin: 'clipboard', key: 'lastAnswer' } as const, null as string | null)
const note = atom({ plugin: 'clipboard', key: 'note' } as const, null as string | null)
const project = atom({ plugin: 'clipboard', key: 'project' } as const, null as string | null)

/** A project folder in one spelling: forward slashes, no trailing slash, lower case (Windows hands the same folder over as `c:\` and `C:\`). */
function normalizeRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** The store key under which a project's clips live: one list per project folder; `clips` alone when no project is known. */
export function storeKey(root: string | null): string {
  return root ? `clips:${normalizeRoot(root)}` : 'clips'
}

/** The project's name for the pane: the last segment of its folder. */
export function projectName(root: string | null): string | null {
  if (!root) return null
  const parts = root.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || root
}

/** The list with `text` kept at the front, a clip identical to the newest one not kept twice, the oldest past the cap dropped. */
export function addClip(list: readonly Clip[], text: string, from: Clip['from'], at: string): Clip[] {
  const clean = text.replace(/\r\n?/g, '\n').trim()
  if (!clean) return [...list]
  if (list[0]?.text === clean) return [...list]
  const id = list.reduce((max, c) => Math.max(max, c.id), 0) + 1
  return [{ id, text: clean, from, at }, ...list].slice(0, MAX_CLIPS)
}

/** Every clip as one markdown document, oldest first, each under a heading that says where and when it came from. */
export function exportMarkdown(list: readonly Clip[]): string {
  const FROM = { selection: 'selected in the chat', answer: "Claude's answer", note: 'typed note' }
  const parts = [...list]
    .reverse()
    .map(c => `## #${c.id} · ${FROM[c.from]} · ${c.at}\n\n${c.text}\n`)
  return `# Clipboard\n\n${parts.join('\n')}`
}

/** A short label for a clip's source and time, for the pane. */
export function stamp(c: Clip): string {
  const FROM = { selection: 'selection', answer: 'answer', note: 'note' }
  const t = c.at.length >= 16 ? c.at.slice(11, 16) : c.at
  return `#${c.id} · ${FROM[c.from]} · ${t}`
}

/** What `/keep <args>` asks for. */
export function parseKeep(args: string): { action: 'selection' | 'answer' | 'export' | 'clear' | 'note'; text: string } {
  const trimmed = args.trim()
  const word = trimmed.toLowerCase()
  if (word === '') return { action: 'selection', text: '' }
  if (word === 'answer') return { action: 'answer', text: '' }
  if (word === 'export') return { action: 'export', text: '' }
  if (word === 'clear') return { action: 'clear', text: '' }
  return { action: 'note', text: trimmed }
}

async function persist($: EngineInterface, list: readonly Clip[]): Promise<void> {
  try {
    await $.store.set(storeKey(await read($, project)), list)
  } catch {
    // The store is unavailable (a test kit, a host without one): the session keeps the list in state.
  }
}

async function keep($: EngineInterface, text: string, from: Clip['from']): Promise<number | null> {
  const at = new Date(await $.clock.now()).toISOString()
  let kept: number | null = null
  await update($, clips, list => {
    const next = addClip(list, text, from, at)
    kept = next.length > list.length ? next[0].id : null
    return next
  })
  await persist($, await read($, clips))
  return kept
}

async function say($: EngineInterface, text: string | null): Promise<void> {
  await update($, note, () => text)
}

async function keepSelection($: EngineInterface): Promise<string> {
  const selected = await $.ui.selection()
  if (!selected?.text.trim()) {
    const surfaces = await $.session.surfaces()
    if (!surfaces.includes('terminal')) {
      return 'This app does not tell mods what you highlight. Use the keep button under a reply, Keep last answer, or /keep followed by the text.'
    }
    return 'Nothing is selected. Select text in the chat with the mouse first, then keep it.'
  }
  const id = await keep($, selected.text, 'selection')
  return id === null ? 'That text is already the newest clip.' : `Kept the selection as #${id}.`
}

async function keepAnswer($: EngineInterface): Promise<string> {
  const text = await read($, lastAnswer)
  if (!text) return 'No answer to keep yet; ask something first.'
  const id = await keep($, text, 'answer')
  return id === null ? 'That answer is already the newest clip.' : `Kept the last answer as #${id}.`
}

async function exportClips($: EngineInterface): Promise<string> {
  const list = await read($, clips)
  if (list.length === 0) return 'Nothing to export yet.'
  const path = `${await $.session.cwd()}/${EXPORT_FILE}`
  await $.fs.write(path, exportMarkdown(list))
  return `Exported ${list.length} clips to ${EXPORT_FILE} in the project folder.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'clipboard', description: 'Open the Clipboard panel' })
    await $.command.register({
      name: 'keep',
      description: 'Keep a snippet in the Clipboard panel: the selected text, "answer" for the last reply, or any text you type; "export" writes clipboard.md, "clear" empties it',
      argumentHint: '[text] | answer | export | clear',
    })

    // Clips are kept per project: the list loaded is the one filed under this session's project folder.
    let root: string | null = null
    try {
      root = await $.session.root()
    } catch {
      // No project known (a test kit, a host without one): one shared list.
    }
    await update($, project, () => root)
    try {
      const stored = await $.store.get(storeKey(root))
      await update($, clips, () => (Array.isArray(stored) ? (stored as Clip[]) : []))
    } catch {
      // No store: start empty.
    }

    void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && !e.isAborted && result.text.trim()) await update($, lastAnswer, () => result.text)
    return result
  })

  on('command.run', { command: 'clipboard' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (opened.isPlaced) return { text: 'Clipboard panel opened.' }
    const list = await read($, clips)
    const name = projectName(await read($, project))
    return { text: `${list.length} clips kept${name ? ` for ${name}` : ''}. (panel not shown: ${opened.reason})` }
  })

  on('command.run', { command: 'keep' }, async ($, e) => {
    const { action, text } = parseKeep(e.args)
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    let result: string
    switch (action) {
      case 'selection': {
        result = await keepSelection($)
        if (result.startsWith('Nothing is selected')) {
          // With nothing selected, /keep alone keeps the last answer instead.
          const fallback = await keepAnswer($)
          result = fallback.startsWith('No answer') ? result : fallback
        }
        break
      }
      case 'answer':
        result = await keepAnswer($)
        break
      case 'export':
        result = await exportClips($)
        break
      case 'clear':
        await update($, clips, () => [])
        await persist($, [])
        result = 'Clipboard emptied.'
        break
      default: {
        const id = await keep($, text, 'note')
        result = id === null ? 'That note is already the newest clip.' : `Kept your note as #${id}.`
      }
    }
    await say($, result)
    return { text: result }
  })

  // A keep button under each reply: the one way to pick a reply on a surface
  // that reports no mouse selection. The reply itself stays as the engine
  // draws it; the button is appended beneath.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const own = await next(e)
    if (e.props.isSummary || !e.props.text.trim()) return own

    const { Box, Button, Text } = $.ui.resolve(e)
    const text = e.props.text
    return (
      <Box flexDirection="column">
        {own}
        {/* A small pill at the end of the reply: a thin red rounded outline the
            desktop draws faithfully. A desktop draws a button's label in its
            own colors; the terminal draws the red text child. */}
        <Box flexDirection="row" justifyContent="flex-end" marginTop={1}>
          <Box borderStyle="round" borderColor={MARYVILLE_RED} paddingX={1}>
            <Button
              key={`keep-${e.requestId}`}
              plain
              label="keep"
              onPress={async () => {
                const id = await keep($, text, 'answer')
                const said = id === null ? 'That reply is already the newest clip.' : `Kept this reply as #${id}.`
                await say($, said)
                $.ui.toast(said)
                void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
              }}
            >
              <Text color={MARYVILLE_RED} bold>
                keep
              </Text>
            </Button>
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e)
    const list = await read($, clips)
    const status = await read($, note)
    const name = projectName(await read($, project))

    return (
      <Box flexDirection="column" rowGap={1}>
        {name && (
          <Box key="project">
            <Text dimColor>Clips for {name}</Text>
          </Box>
        )}
        <Box key="actions" flexDirection="row" columnGap={1} flexWrap="wrap">
          <Button key="keep-selection" label="Keep selection" hotkey="s" onPress={async () => say($, await keepSelection($))} />
          <Button key="keep-answer" label="Keep last answer" hotkey="a" onPress={async () => say($, await keepAnswer($))} />
          <Button key="export" label="Export" hotkey="e" onPress={async () => say($, await exportClips($))} />
        </Box>
        <Input
          key="note"
          placeholder="Type a note and press Enter"
          submitLabel="Keep"
          onSubmit={async (value: string) => {
            const id = await keep($, value, 'note')
            await say($, id === null ? 'That note is already the newest clip.' : `Kept your note as #${id}.`)
          }}
        />
        {status && (
          <Box key="status">
            <Text dimColor>{status}</Text>
          </Box>
        )}
        {list.length === 0 && (
          <Box key="empty">
            <Text dimColor wrap="wrap">
              Nothing kept in this project yet. Select text in the chat and press Keep selection, keep Claude's last answer, or type a note. /keep does the same from the prompt.
            </Text>
          </Box>
        )}
        {list.map(c => (
          <Box key={`clip-${c.id}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Box key={`head-${c.id}`} flexDirection="row" columnGap={1}>
              <Text dimColor>{stamp(c)}</Text>
              <Button
                key={`copy-${c.id}`}
                plain
                label="copy"
                onPress={async press => {
                  const r = await $.ui.copy({ text: c.text, surface: press.surface })
                  await say(
                    $,
                    r.isCopied
                      ? `Copied #${c.id} to the clipboard.`
                      : `This app does not let a mod write the clipboard (${r.reason}); select the text here and press Ctrl+C, or Export.`,
                  )
                }}
              />
              <Button
                key={`del-${c.id}`}
                plain
                label="delete"
                onPress={async () => {
                  await update($, clips, l => l.filter(x => x.id !== c.id))
                  await persist($, await read($, clips))
                  await say($, `Deleted #${c.id}.`)
                }}
              />
            </Box>
            <Markdown key={`text-${c.id}`} text={c.text} />
          </Box>
        ))}
      </Box>
    )
  })
}
