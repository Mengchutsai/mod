import type { Register } from 'claude-code'

const COMMAND = 'maryville'
const THEMES = { dark: 'maryville', light: 'maryville-light' } as const
type Variant = keyof typeof THEMES

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Switch Claude Code to Maryville University colors',
      argumentHint: 'dark | light',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const variant = pick(e.args)
    const slug = THEMES[variant]

    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (!home) return { text: 'Could not find your home folder, so the theme was not installed.' }

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
      return { text: `Installed ~/.claude/themes/${slug}.json, but ~/.claude/settings.json could not be parsed, so it was left alone. Pick "Maryville" in /theme.` }
    }
    await $.fs.write(settingsPath, updated)

    return { text: `Maryville ${variant} theme is set in ~/.claude/settings.json. If the colors do not change right away, pick "Maryville" in /theme or restart Claude Code.` }
  }).catch((_$, _e, next) => ({
    text: `The Maryville theme could not be applied: ${next.error.message ?? next.error.kind}. Pick "Maryville" in /theme instead.`,
  }))
}
