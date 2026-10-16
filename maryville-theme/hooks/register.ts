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

    // Plugin themes are read-only and keyed by plugin; a copy in the person's
    // own themes folder is what `custom:<slug>` selects, so install it there.
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (!home) return { text: 'Could not find your home folder, so the theme was not installed.' }
    const text = await $.fs.read(`${$.plugin.root}/themes/${slug}.json`)
    await $.fs.write(`${home}/.claude/themes/${slug}.json`, text)

    const result = await $.config.set({ key: 'theme', value: preference(variant) })
    if ('deny' in result && result.deny) {
      return { text: `Installed ~/.claude/themes/${slug}.json, but the theme could not be switched: ${result.deny}. Pick "Maryville" in /theme.` }
    }
    return { text: `Maryville ${variant} theme is on. Switch back any time with /theme.` }
  }).catch((_$, _e, next) => ({
    text: `The Maryville theme could not be applied: ${next.error.message ?? next.error.kind}. Pick "Maryville" in /theme instead.`,
  }))
}
