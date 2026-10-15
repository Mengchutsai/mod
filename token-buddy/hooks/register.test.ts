import { test, expect, mock } from 'claude-code/testing'

import { bar, mood } from './register'

test('mood and bar follow how much is left', async () => {
  expect(mood(90).face).toBe('(｡◕‿◕｡)')
  expect(mood(5).line).toContain('/compact')
  expect(bar(50, 10)).toBe('♥♥♥♥♥·····')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pane shows context and limits left on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 150_000, window: 200_000, percent: 75 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({
      plugin: 'token-buddy',
      surface,
      component: 'Pane',
      requestId: 'token-buddy',
      props: {} as never,
    })
    expect((await ui.find({ key: 'left' }))?.text).toContain('25% left')
    expect((await ui.find({ key: 'left' }))?.text).toContain('~50k of 200k tokens')
    expect((await ui.find({ key: 'mood' }))?.text).toContain('full')
    expect((await ui.find({ key: 'limit-five_hour' }))?.text).toContain('60% left')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band above the prompt shows what is left on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 150_000, window: 200_000, percent: 75 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 10 }],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'token-buddy', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    const text = (await ui.find({ key: 'band' }))?.text
    expect(text).toContain('25% left')
    expect(text).toContain('Weekly limit 90% left')
  })
}
