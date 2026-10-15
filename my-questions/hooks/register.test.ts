import { test, expect } from 'claude-code/testing'

import { preview } from './register'

test('preview flattens and shortens long questions', () => {
  expect(preview('how\n  to   install?')).toBe('how to install?')
  expect(preview('x'.repeat(100), 10)).toBe('xxxxxxxxx…')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`panel lists only your own questions, numbered, on ${surface}`, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, (_$, e) => ({ type: 'Text', children: [e.props.text] }) as never)

    for (const [id, text, kind] of [
      ['row-1', 'how to use mod here', 'composer'],
      ['row-2', 'background task done', 'task-notification'],
      ['row-3', 'how to install?', 'composer'],
    ] as const) {
      await $.ui.mount({
        plugin: 'my-questions', surface, component: 'UserMessage', requestId: id,
        props: { text, origin: { kind }, isExpanded: true } as never,
      })
    }

    const ui = await $.ui.mount({ plugin: 'my-questions', surface, component: 'Pane', requestId: 'my-questions', props: {} as never })
    expect((await ui.find({ key: 'q-1' }))?.text).toContain('1. how to use mod here')
    expect((await ui.find({ key: 'q-2' }))?.text).toContain('2. how to install?')
    expect(await ui.find({ key: 'q-3' })).toBeUndefined()
  })
}
