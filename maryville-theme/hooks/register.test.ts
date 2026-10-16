import { test, expect } from 'claude-code/testing'

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

test('withTheme starts a missing or empty settings file', async () => {
  expect(JSON.parse(withTheme(undefined, 'custom:maryville')).theme).toBe('custom:maryville')
  expect(JSON.parse(withTheme('  ', 'custom:maryville-light')).theme).toBe('custom:maryville-light')
})

test('withTheme refuses a settings file that is not an object', async () => {
  expect(() => withTheme('[1, 2]', 'custom:maryville')).toThrow()
  expect(() => withTheme('not json', 'custom:maryville')).toThrow()
})
