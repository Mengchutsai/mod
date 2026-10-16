import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Usage } from '../types'
import {
  DONE_WORDS,
  ICONS,
  SPINNER_WORDS,
  paletteFor,
  diffCounts,
  diffSource,
  fold,
  formatMs,
  hunksOf,
  kindOf,
  label,
  meter,
  modeOf,
  summarize,
  wordFor,
} from './palette'
import type { Mode } from './palette'

const COMMAND = 'maryville'
const THEMES = { dark: 'maryville', light: 'maryville-light' } as const
type Variant = keyof typeof THEMES

const FOLD_LINES = 12

const mode = atom({ plugin: 'maryville-theme', key: 'mode' } as const, 'dark' as Mode)
const isOn = atom({ plugin: 'maryville-theme', key: 'isOn' } as const, true)
const band = atom({ plugin: 'maryville-theme', key: 'band' } as const, false)
const usage = atom({ plugin: 'maryville-theme', key: 'usage' } as const, null as Usage | null)

/** Which variant the person asked for: `light` or anything else means dark. */
export function pick(args: string): Variant {
  return args.trim().toLowerCase() === 'light' ? 'light' : 'dark'
}

/** The theme preference stored for a user theme file `~/.claude/themes/<slug>.json`. */
export function preference(variant: Variant): string {
  return `custom:${THEMES[variant]}`
}

/**
 * The user settings file with its `theme` set to `value`, every other key
 * kept. An absent file becomes `{ "theme": value }`; a file that is not a
 * JSON object throws, so the caller leaves it alone.
 */
export function withTheme(settings: string | undefined, value: string): string {
  const parsed: unknown = settings === undefined || settings.trim() === '' ? {} : JSON.parse(settings)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('settings.json is not a JSON object')
  }
  return JSON.stringify({ ...(parsed as Record<string, unknown>), theme: value }, null, 2) + '\n'
}

function toUsage(context: SessionContextUsage, limits: readonly SessionRateLimit[]): Usage {
  return {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    limits: limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
}

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'week',
  spend_limit: 'spend',
}

/** When each tool call started and ended, for the elapsed time on its row. */
const timings = new Map<string, { start: number; end?: number }>()

/** How often each drawing hook ran since the module loaded, per surface: `/maryville status` reports it. */
const fired: Record<string, number> = {}
function count(component: string, surface: string, outcome: 'drew' | 'passed'): void {
  const key = `${component}@${surface}:${outcome}`
  fired[key] = (fired[key] ?? 0) + 1
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Maryville colors: dark | light | on | off | band | status',
      argumentHint: 'dark | light | on | off | band | status',
    })

    const theme = (await $.config.list()).find(row => row.key === 'theme')
    await update($, mode, () => modeOf(theme?.value))
    const storedOn = await $.store.get('isOn')
    if (typeof storedOn === 'boolean') await update($, isOn, () => storedOn)
    const storedBand = await $.store.get('band')
    if (typeof storedBand === 'boolean') await update($, band, () => storedBand)

    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.context, u.rateLimits))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.context, e.rateLimits))
    return next(e)
  })

  // Follow the theme when the person changes it in /theme or /config.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result && result.deny)) await update($, mode, () => modeOf(e.value))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const start = await $.clock.now()
    timings.set(e.tool_use_id, { start })
    const result = await next(e)
    timings.set(e.tool_use_id, { start, end: await $.clock.now() })
    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'status') {
      const surfaces = (await $.session.surfaces()).join(', ') || 'none'
      const counts = Object.entries(fired)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, n]) => `${k} ${n}`)
        .join('\n')
      return {
        text: [
          `surfaces: ${surfaces}`,
          `mode: ${await read($, mode)}, drawing: ${(await read($, isOn)) ? 'on' : 'off'}, band: ${(await read($, band)) ? 'on' : 'off'}`,
          'drawing hooks asked since load:',
          counts || '(none yet)',
        ].join('\n'),
      }
    }

    if (arg === 'off' || arg === 'on') {
      const value = arg === 'on'
      await update($, isOn, () => value)
      await $.store.set('isOn', value)
      return { text: value ? 'Maryville drawing is on.' : "Maryville drawing is off; Claude Code's own drawing is back. /maryville on restores it." }
    }

    if (arg === 'band') {
      const value = !(await read($, band))
      await update($, band, () => value)
      await $.store.set('band', value)
      return { text: value ? 'Usage band above the prompt is on.' : 'Usage band above the prompt is off.' }
    }

    const variant = pick(arg)
    const slug = THEMES[variant]
    await update($, mode, () => variant)
    await update($, isOn, () => true)
    await $.store.set('isOn', true)

    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (!home) return { text: `Maryville ${variant} drawing is on, but your home folder was not found, so the terminal theme was not installed.` }

    // Plugin themes are read-only and keyed by plugin; a copy in the person's
    // own themes folder is what `custom:<slug>` selects, so install it there.
    const theme = await $.fs.read(`${$.plugin.root}/themes/${slug}.json`)
    await $.fs.write(`${home}/.claude/themes/${slug}.json`, theme)

    // The /config theme row takes only the built-in names, so the custom
    // preference goes into settings.json directly, as /theme itself stores it.
    const settingsPath = `${home}/.claude/settings.json`
    const current = await $.fs.read(settingsPath).catch(() => undefined)
    let updated: string
    try {
      updated = withTheme(current, preference(variant))
    } catch {
      return { text: `Maryville ${variant} drawing is on. ~/.claude/settings.json could not be parsed, so the terminal theme was left alone; pick "Maryville" in /theme.` }
    }
    await $.fs.write(settingsPath, updated)

    return { text: `Maryville ${variant} is on: tool rows, edit cards and your messages are drawn in brand colors here, and the terminal theme is set in ~/.claude/settings.json. /maryville off restores Claude Code's own drawing.` }
  }).catch((_$, _e, next) => ({
    text: `The Maryville theme could not be applied: ${next.error.message ?? next.error.kind}. Pick "Maryville" in /theme instead.`,
  }))

  // --- the transcript -------------------------------------------------------

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    if (!(await read($, isOn)) || kind === null) {
      count('ToolUse', e.surface, 'passed')
      return next(e)
    }
    count('ToolUse', e.surface, 'drew')

    const p = paletteFor(await read($, mode), e.surface)
    const { Box, Text } = $.ui.resolve(e)
    const { isRunning, isErrored, isInterrupted } = e.props
    const state = isInterrupted ? { glyph: '⊘', color: p.warn } : isErrored ? { glyph: '✗', color: p.err } : isRunning ? { glyph: '◌', color: p.accent } : { glyph: '✓', color: p.ok }
    const target = summarize(e.props.tool, e.props.input)
    const timing = timings.get(e.props.tool_use_id)
    const elapsed = timing?.end !== undefined ? formatMs(timing.end - timing.start) : ''
    const hunks = kind === 'write' ? hunksOf(e.props.output) : []
    const counts = hunks.length ? diffCounts(hunks) : null

    return (
      <Box key="tool-row" flexDirection="row" columnGap={1}>
        <Text color={state.color}>{state.glyph}</Text>
        <Text color={p[kind]} bold>
          {ICONS[kind]} {label(e.props.tool)}
        </Text>
        {target !== '' && (
          <Text color={p.muted} wrap="truncate-end">
            {target}
          </Text>
        )}
        {counts !== null && (counts.added > 0 || counts.removed > 0) && (
          <Text>
            <Text color={p.ok}>+{counts.added}</Text> <Text color={p.err}>−{counts.removed}</Text>
          </Text>
        )}
        {elapsed !== '' && <Text color={p.muted} dimColor>{elapsed}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    if (!(await read($, isOn)) || kind === null) {
      count('ToolResult', e.surface, 'passed')
      return next(e)
    }
    count('ToolResult', e.surface, 'drew')

    const p = paletteFor(await read($, mode), e.surface)
    const tint = p.surface ? { backgroundColor: p.surface } : {}
    const { Box, Text, Code } = $.ui.resolve(e)

    if (e.props.isErrored) {
      const text = typeof e.props.output === 'string' ? e.props.output : JSON.stringify(e.props.output)
      const { lines, hidden } = fold(text ?? '', FOLD_LINES)
      return (
        <Box key="error-card" flexDirection="column" borderStyle="round" borderColor={p.err} paddingX={1}>
          {lines.map((line, i) => (
            <Text key={`e${i}`} color={p.err}>
              {line}
            </Text>
          ))}
          {hidden > 0 && <Text color={p.muted}>… {hidden} more lines</Text>}
        </Box>
      )
    }

    if (kind === 'write') {
      const hunks = hunksOf(e.props.output)
      const out = (typeof e.props.output === 'object' && e.props.output !== null ? e.props.output : {}) as {
        filePath?: string
        type?: string
        content?: string
        staged?: boolean
      }
      const path = out.filePath ?? summarize(e.props.tool, undefined)
      if (hunks.length === 0) {
        const lines = typeof out.content === 'string' ? out.content.split('\n').length : 0
        return (
          <Box key="write-card" flexDirection="row" columnGap={1}>
            <Text color={p.ok}>{out.type === 'create' ? 'created' : 'wrote'}</Text>
            <Text color={p.muted}>{path}</Text>
            {lines > 0 && <Text color={p.muted} dimColor>{lines} lines</Text>}
            {out.staged && <Text color={p.warn}>held for review</Text>}
          </Box>
        )
      }
      const { added, removed } = diffCounts(hunks)
      return (
        <Box key="diff-card" flexDirection="column" borderStyle="round" borderColor={p.accent}>
          <Box key="diff-head" flexDirection="row" columnGap={1} paddingX={1} {...tint}>
            <Text color={p.accent} bold>
              {ICONS.write} {path}
            </Text>
            <Text color={p.ok}>+{added}</Text>
            <Text color={p.err}>−{removed}</Text>
            {out.staged && <Text color={p.warn}>held for review</Text>}
          </Box>
          <Code source={diffSource(hunks)} format="diff" path={typeof path === 'string' ? path : undefined} />
        </Box>
      )
    }

    if (kind === 'run') {
      const out = (typeof e.props.output === 'object' && e.props.output !== null ? e.props.output : {}) as {
        stdout?: string
        stderr?: string
        interrupted?: boolean
        backgroundTaskId?: string
      }
      const so = fold(out.stdout ?? '', FOLD_LINES)
      const se = fold(out.stderr ?? '', FOLD_LINES)
      if (so.lines.length === 0 && se.lines.length === 0 && !out.backgroundTaskId) {
        return <Text key="shell-empty" color={p.muted} dimColor>(no output)</Text>
      }
      return (
        <Box key="shell-card" flexDirection="column" borderStyle="single" borderColor={p.muted} borderDimColor paddingX={1}>
          {out.backgroundTaskId && <Text color={p.accentSoft}>running in the background ({out.backgroundTaskId})</Text>}
          {so.lines.map((line, i) => (
            <Text key={`o${i}`} color={p.fg}>
              {line}
            </Text>
          ))}
          {so.hidden > 0 && <Text color={p.muted}>… {so.hidden} more lines</Text>}
          {se.lines.map((line, i) => (
            <Text key={`s${i}`} color={p.err}>
              {line}
            </Text>
          ))}
          {se.hidden > 0 && <Text color={p.err} dimColor>… {se.hidden} more lines of stderr</Text>}
          {out.interrupted && <Text color={p.warn}>interrupted</Text>}
        </Box>
      )
    }

    // Reads, searches, web and MCP results keep Claude Code's own drawing.
    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // The person's own words arrive as `composer` at the terminal, `bridge`
    // from Remote Control and `sdk` from the desktop app; rows that carry a
    // task or another party's message keep Claude Code's own drawing.
    const { kind } = e.props.origin
    const isTheirs = kind === 'composer' || kind === 'bridge' || kind === 'sdk' || kind === 'unclassified'
    if (!(await read($, isOn)) || e.props.task || e.props.from || !isTheirs) {
      count('UserMessage', e.surface, 'passed')
      return next(e)
    }
    count('UserMessage', e.surface, 'drew')

    // Let the plugins beneath see the row (my-questions records prompts from
    // it) before this tree replaces what they and the engine would draw.
    await next(e)

    const p = paletteFor(await read($, mode), e.surface)
    const tint = p.surface ? { backgroundColor: p.surface } : {}
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="you" paddingX={1} borderStyle="round" borderColor={p.accent} {...tint}>
        <Text color={p.fg} wrap="wrap">
          {e.props.text}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    count('Spinner', e.surface, 'passed')
    if (e.surface !== 'terminal' || e.props.message !== null || !(await read($, isOn))) return next(e)
    return next({ ...e, props: { ...e.props, word: wordFor(SPINNER_WORDS, e.requestId) } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    return next({ ...e, props: { ...e.props, word: wordFor(DONE_WORDS, e.requestId) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn)) || !(await read($, band))) return next(e)
    const u = await read($, usage)
    if (!u || u.percent === undefined) return next(e)

    const p = paletteFor(await read($, mode), e.surface)
    const { Box, Text } = $.ui.resolve(e)
    const used = u.percent
    const color = used >= 90 ? p.err : used >= 70 ? p.warn : p.accent
    return (
      <Box key="band" flexDirection="row" columnGap={2} paddingX={1} borderStyle="round" borderColor={p.accent}>
        <Text>
          <Text color={color}>{meter(used)}</Text> <Text color={p.muted}>context {100 - used}% left</Text>
        </Text>
        {u.limits.map(l => (
          <Text key={`limit-${l.kind}`} color={p.muted}>
            {LIMIT_NAMES[l.kind] ?? l.kind} {Math.max(0, Math.round(100 - l.percentUsed))}% left
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput', props: { command: COMMAND } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    count('CommandOutput', e.surface, 'drew')
    const p = paletteFor(await read($, mode), e.surface)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="mu-output" paddingX={1} borderStyle="round" borderColor={p.accent}>
        <Text color={p.fg} wrap="wrap">
          {e.props.text}
        </Text>
      </Box>
    )
  })
}
