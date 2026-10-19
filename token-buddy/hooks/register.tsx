import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Snapshot } from '../types'

const PANE = 'token-buddy'
const TITLE = 'Token Buddy'
const snapshot = atom({ plugin: 'token-buddy', key: 'snapshot' } as const, null)

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  spend_limit: 'Spend limit',
}

function toSnapshot(context: SessionContextUsage, limits: SessionRateLimit[]): Snapshot {
  return {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    limits: limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
}

export function mood(left: number): { face: string; line: string; color: string } {
  if (left > 60) return { face: '(｡◕‿◕｡)', line: 'Plenty of room to play!', color: 'success' }
  if (left > 30) return { face: '(・ω・)', line: 'Doing just fine~', color: 'suggestion' }
  if (left > 10) return { face: '(；・∀・)', line: 'Getting a little full...', color: 'warning' }
  return { face: '(×_×)', line: 'So full! Try /compact', color: 'error' }
}

export function bar(left: number, width = 16): string {
  const filled = Math.round((Math.max(0, Math.min(100, left)) / 100) * width)
  return '♥'.repeat(filled) + '·'.repeat(width - filled)
}

export function statusLine(snap: Snapshot): string {
  if (snap.percent === undefined) return '(｡･ω･｡) counting tokens after the first reply'
  const left = 100 - snap.percent
  const limits = snap.limits
    .map(l => `${LIMIT_NAMES[l.kind] ?? l.kind} ${Math.max(0, Math.round(100 - l.percentUsed))}% left`)
    .join(' · ')
  return `${mood(left).face} context ${bar(left, 10)} ${left}% left${limits ? ' · ' + limits : ''}`
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  if (Number.isNaN(mins)) return ''
  if (mins < 60) return ` · resets in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return ` · resets in ${hours}h ${mins % 60}m`
  return ` · resets in ${Math.round(hours / 24)}d`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tokens', description: 'Open the Token Buddy panel' })
    const usage = await $.session.usage()
    const snap = toSnapshot(usage.context, usage.rateLimits)
    await update($, snapshot, () => snap)
    $.ui.status(statusLine(snap))
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    const surfaces = (await $.session.surfaces()).join(', ') || 'none'
    const snap = await read($, snapshot)
    const line = snap ? statusLine(snap) : 'no reading yet'

    if (opened.isPlaced) return { text: `Token Buddy is here! (｡◕‿◕｡)  ${line}` }

    return { text: `${line}\n(panel not shown: ${opened.reason}; surfaces: ${surfaces})` }
  })

  on('session.measure', async ($, e, next) => {
    const snap = toSnapshot(e.context, e.rateLimits)
    await update($, snapshot, () => snap)
    $.ui.status(statusLine(snap))

    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const now = await $.clock.now()

    if (!snap || snap.percent === undefined) {
      return (
        <Box flexDirection="column">
          <Text color="claude">(｡･ω･｡)ﾉ</Text>
          <Text dimColor>Hi! I'll count your tokens after the first reply.</Text>
        </Box>
      )
    }

    const left = 100 - snap.percent
    const m = mood(left)
    const tokensLeft = snap.tokens === undefined ? undefined : Math.max(0, snap.window - snap.tokens)

    return (
      <Box flexDirection="column">
        <Box key="face"><Text color={m.color} bold>{m.face}</Text></Box>
        <Box key="mood"><Text italic>{m.line}</Text></Box>
        <Text> </Text>
        <Text bold>Context left</Text>
        <Text color={m.color}>{bar(left)}</Text>
        <Box key="left">
          <Text>
            {left}% left
            {tokensLeft !== undefined && ` · ~${compact(tokensLeft)} of ${compact(snap.window)} tokens`}
          </Text>
        </Box>
        {snap.limits.length > 0 && <Text> </Text>}
        {snap.limits.map(l => {
          const limitLeft = Math.max(0, Math.round(100 - l.percentUsed))
          const lm = mood(limitLeft)
          return (
            <Box key={`limit-${l.kind}`} flexDirection="column">
              <Text bold>{LIMIT_NAMES[l.kind] ?? l.kind}</Text>
              <Text color={lm.color}>{bar(limitLeft)}</Text>
              <Text dimColor>
                {limitLeft}% left{untilReset(l.resetsAt, now)}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
