import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Question } from '../types'

const PANE = 'my-questions'
const TITLE = 'My Questions'
const PERSON = new Set(['composer', 'bridge', 'sdk'])
const questions = atom({ plugin: 'my-questions', key: 'questions' } as const, [])

export function preview(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function merge(saved: readonly Question[], fresh: readonly Question[]): Question[] {
  const ids = new Set(saved.map(q => q.requestId))
  return [...saved, ...fresh.filter(q => !ids.has(q.requestId))].slice(-500)
}

// Rows seen while drawing; a drawing may not write state, so later events save them.
let seen: Question[] = []

async function save($: EngineInterface) {
  if (seen.length === 0) return
  const fresh = seen
  seen = []
  await update($, questions, saved => merge(saved, fresh))
}

export const register: Register = on => {

  on('prompt.submit', async ($, e, next) => {
    await save($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await save($)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'questions', description: 'Open the My Questions panel' })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'questions' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (opened.isPlaced) return { text: 'My Questions panel opened.' }

    await save($)
    const list = await read($, questions)
    const lines = list.map((q, i) => `${i + 1}. ${preview(q.text, 80)}`).join('\n')
    return { text: `${lines || 'No questions yet.'}\n(panel not shown: ${opened.reason})` }
  })

  // Each prompt row the transcript draws is remembered with its row id, so the panel can scroll back to it.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const text = e.props.text.trim()
    if (PERSON.has(e.props.origin.kind) && text && !text.startsWith('<')) {
      if (!seen.some(q => q.requestId === e.requestId)) seen = [...seen, { requestId: e.requestId, text }]
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = merge(await read($, questions), seen)

    if (list.length === 0) {
      return <Text dimColor>Your questions will show up here.</Text>
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>{list.length} questions · click to jump</Text>
        {list.map((q, i) => (
          <Button
            key={`q-${i + 1}`}
            plain
            label={`${i + 1}. ${preview(q.text)}`}
            onPress={() => $.ui.scroll({ to: { requestId: q.requestId }, block: 'start' })}
          />
        ))}
      </Box>
    )
  })
}
