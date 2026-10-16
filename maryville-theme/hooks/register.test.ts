import { test, expect } from 'claude-code/testing'

import { pick, preference } from './register'

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
