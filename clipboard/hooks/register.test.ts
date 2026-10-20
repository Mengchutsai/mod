import { test, expect, mock } from 'claude-code/testing'

import { addClip, exportMarkdown, parseKeep, projectName, stamp, storeKey } from './register'

const AT = '2026-10-16T15:04:00.000Z'

test('storeKey files clips by project folder, in one spelling', async () => {
  expect(storeKey(null)).toBe('clips')
  expect(storeKey('C:\\Users\\me\\Proj\\')).toBe('clips:c:/users/me/proj')
  expect(storeKey('c:/Users/me/Proj')).toBe('clips:c:/users/me/proj')
  expect(storeKey('/work/a')).not.toBe(storeKey('/work/b'))
  expect(projectName('C:\\Users\\me\\My Proj')).toBe('My Proj')
  expect(projectName(null)).toBeNull()
})

test('each project loads and keeps its own clips', async ($, on) => {
  mock.clock(on)
  mock.store(on, { 'clips:/work/a': [{ id: 1, text: 'kept in a', from: 'note', at: AT }] })
  on('command.register', () => ({ value: { command: 'keep' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let root = '/work/b'
  on('session.root', () => ({ value: root }))

  // Project b starts empty, though project a has a clip, and keeps its own.
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'clipboard', surface: 'desktop', component: 'Pane', requestId: 'clipboard', props: {} as never })
  expect((await ui.find({ key: 'project' }))?.text).toContain('Clips for b')
  expect(await ui.find({ type: 'Markdown', text: 'kept in a' })).toBeUndefined()
  await ui.input({ key: 'note', text: 'kept in b' })
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('kept in b')
  await ui.unmount()

  // Back in project a, its clip is there and b's is not.
  root = '/work/a'
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  ui = await $.ui.mount({ plugin: 'clipboard', surface: 'desktop', component: 'Pane', requestId: 'clipboard', props: {} as never })
  expect((await ui.find({ key: 'project' }))?.text).toContain('Clips for a')
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('kept in a')
  expect(await ui.find({ type: 'Markdown', text: 'kept in b' })).toBeUndefined()
  await ui.unmount()
})

test('addClip keeps newest first, skips an exact repeat, and trims', async () => {
  const one = addClip([], '  hello  \r\n', 'note', AT)
  expect(one).toHaveLength(1)
  expect(one[0].text).toBe('hello')
  expect(one[0].id).toBe(1)
  const same = addClip(one, 'hello', 'selection', AT)
  expect(same).toHaveLength(1)
  const two = addClip(one, 'world', 'answer', AT)
  expect(two[0].id).toBe(2)
  expect(two[0].text).toBe('world')
  expect(two[1].text).toBe('hello')
  expect(addClip(one, '   ', 'note', AT)).toHaveLength(1)
})

test('exportMarkdown lists clips oldest first under headings', async () => {
  const list = addClip(addClip([], 'first', 'note', AT), 'second', 'answer', AT)
  const md = exportMarkdown(list)
  expect(md.startsWith('# Clipboard')).toBe(true)
  expect(md.indexOf('first')).toBeLessThan(md.indexOf('second'))
  expect(md).toContain("## #2 · Claude's answer")
})

test('parseKeep and stamp', async () => {
  expect(parseKeep('')).toEqual({ action: 'selection', text: '' })
  expect(parseKeep(' Answer ')).toEqual({ action: 'answer', text: '' })
  expect(parseKeep('export')).toEqual({ action: 'export', text: '' })
  expect(parseKeep('remember this line')).toEqual({ action: 'note', text: 'remember this line' })
  expect(stamp({ id: 3, text: 'x', from: 'selection', at: AT })).toBe('#3 · selection · 15:04')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a keep button sits under each reply and keeps it on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ({ type: 'Text', children: [e.props.text] }) as never)
    const reply = await $.ui.mount({
      plugin: 'clipboard',
      surface,
      component: 'AssistantMessage',
      requestId: 'msg-7',
      props: { text: 'The answer is **42**.', isFirstOfReply: true },
    })
    expect((await reply.find({ type: 'Text' }))?.text).toContain('The answer is')
    await reply.press({ key: 'keep-msg-7' })

    const pane = await $.ui.mount({ plugin: 'clipboard', surface, component: 'Pane', requestId: 'clipboard', props: {} as never })
    expect((await pane.find({ type: 'Markdown' }))?.props.text).toBe('The answer is **42**.')
  })

  test(`a typed note lands in the pane as markdown on ${surface}`, async ($, on) => {
    mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'clipboard', surface, component: 'Pane', requestId: 'clipboard', props: {} as never })
    expect((await ui.find({ key: 'empty' }))?.text).toContain('Nothing kept in this project yet')

    await ui.input({ key: 'note', text: 'keep **this** table' })

    expect(await ui.find({ key: 'empty' })).toBeUndefined()
    const kept = await ui.find({ type: 'Markdown' })
    expect(kept?.props.text).toBe('keep **this** table')
    expect((await ui.find({ key: 'status' }))?.text).toContain('Kept your note as #1')
  })
}
