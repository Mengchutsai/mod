import { test, expect } from 'claude-code/testing'

import { diffCounts, diffSource, fold, formatMs, hunksOf, kindOf, label, modeOf, summarize, wordFor, SPINNER_WORDS } from './palette'
import { pick, preference, withTheme } from './register'

test('light is the only word that picks the light variant', async () => {
  expect(pick('')).toBe('dark')
  expect(pick('dark')).toBe('dark')
  expect(pick(' Light ')).toBe('light')
  expect(pick('anything')).toBe('dark')
})

test('the stored preference names the user theme file', async () => {
  expect(preference('dark')).toBe('custom:maryville')
  expect(preference('light')).toBe('custom:maryville-light')
})

test('withTheme sets theme and keeps every other setting', async () => {
  const before = JSON.stringify({ model: 'fable', theme: 'dark', permissions: { allow: ['Read'] } })
  const after = JSON.parse(withTheme(before, 'custom:maryville'))
  expect(after.theme).toBe('custom:maryville')
  expect(after.model).toBe('fable')
  expect(after.permissions.allow[0]).toBe('Read')
})

test('withTheme starts a missing settings file and refuses a non-object', async () => {
  expect(JSON.parse(withTheme(undefined, 'custom:maryville')).theme).toBe('custom:maryville')
  expect(() => withTheme('[1, 2]', 'custom:maryville')).toThrow()
})

test('the palette follows the theme preference', async () => {
  expect(modeOf('custom:maryville-light')).toBe('light')
  expect(modeOf('light-daltonized')).toBe('light')
  expect(modeOf('custom:maryville')).toBe('dark')
  expect(modeOf(undefined)).toBe('dark')
})

test('tool kinds, labels and summaries', async () => {
  expect(kindOf('Edit')).toBe('write')
  expect(kindOf('Bash')).toBe('run')
  expect(kindOf('mcp__github__search_code')).toBe('mcp')
  expect(kindOf('Agent')).toBe(null)
  expect(label('mcp__github__search_code')).toBe('github:search_code')
  expect(summarize('Bash', { command: 'git  status\n--short' })).toBe('git status --short')
  expect(summarize('Edit', { file_path: 'C:\\Users\\me\\proj\\src\\a.ts' })).toBe('…/src/a.ts')
  expect(summarize('Grep', { pattern: 'foo', path: '/x/y/z' })).toBe('foo in …/y/z')
  expect(summarize('WebFetch', { url: 'https://example.com/a' })).toBe('example.com/a')
})

const HUNKS = [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' a', '-b', '+c', '+d'] }]

test('a structured patch becomes one unified diff with counts', async () => {
  expect(diffSource(HUNKS)).toBe('@@ -1,2 +1,3 @@\n a\n-b\n+c\n+d')
  expect(diffCounts(HUNKS)).toEqual({ added: 2, removed: 1 })
  expect(hunksOf({ structuredPatch: HUNKS })).toHaveLength(1)
  expect(hunksOf({ stdout: 'x' })).toHaveLength(0)
  expect(hunksOf('error text')).toHaveLength(0)
})

test('folding and timing read well', async () => {
  expect(fold('', 3)).toEqual({ lines: [], hidden: 0 })
  expect(fold('a\r\nb\nc\nd\n', 3)).toEqual({ lines: ['a', 'b', 'c'], hidden: 1 })
  expect(formatMs(250)).toBe('250ms')
  expect(formatMs(1234)).toBe('1.2s')
  expect(formatMs(75_000)).toBe('1m 15s')
  expect(wordFor(SPINNER_WORDS, 'turn-1')).toBe(wordFor(SPINNER_WORDS, 'turn-1'))
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an Edit row shows the tool, the file and its counts on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'maryville-theme',
      surface,
      component: 'ToolUse',
      requestId: 'tu1',
      props: {
        tool_use_id: 'tu1',
        tool: 'Edit',
        input: { file_path: '/proj/src/a.ts', old_string: 'b', new_string: 'c' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { filePath: '/proj/src/a.ts', structuredPatch: HUNKS },
      },
    })
    const row = await ui.find({ key: 'tool-row' })
    expect(row?.text).toContain('Edit')
    expect(row?.text).toContain('…/src/a.ts')
    expect(row?.text).toContain('+2')
    expect(row?.text).toContain('−1')
  })

  test(`an Edit result is a diff card on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'maryville-theme',
      surface,
      component: 'ToolResult',
      requestId: 'tu1',
      props: {
        tool_use_id: 'tu1',
        tool: 'Edit',
        output: { filePath: '/proj/src/a.ts', structuredPatch: HUNKS },
        isErrored: false,
      },
    })
    expect(await ui.find({ key: 'diff-card' })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(code?.props.format).toBe('diff')
    expect(code?.props.source).toContain('+c')
  })

  test(`a shell result folds long output on ${surface}`, async $ => {
    const stdout = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const ui = await $.ui.mount({
      plugin: 'maryville-theme',
      surface,
      component: 'ToolResult',
      requestId: 'tu2',
      props: { tool_use_id: 'tu2', tool: 'Bash', output: { stdout, stderr: 'warn', interrupted: false }, isErrored: false },
    })
    const card = await ui.find({ key: 'shell-card' })
    expect(card?.text).toContain('line 12')
    expect(card?.text).toContain('8 more lines')
    expect(card?.text).toContain('warn')
  })

  test(`the person's prompt is drawn on a tinted row on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'maryville-theme',
      surface,
      component: 'UserMessage',
      requestId: 'm1',
      props: { text: 'change the app theme', origin: { kind: 'composer' }, isExpanded: false },
    })
    const row = await ui.find({ key: 'you' })
    expect(row?.text).toContain('change the app theme')
    expect(row?.props.backgroundColor).toBe('#2b1114')
  })
}
