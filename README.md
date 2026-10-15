# Claude Code mods

| Mod | What it does |
| --- | --- |
| **token-buddy** | A cute critter in a side panel (and a row above the prompt) showing how much context, 5-hour and weekly usage you have left. `/tokens` reopens it. |
| **my-questions** | A side panel listing every question you asked in the session; click one to jump to it in the chat. `/questions` reopens it. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install token-buddy --marketplace Mengchutsai/mod
/plugin install my-questions --marketplace Mengchutsai/mod
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install token-buddy --marketplace Mengchutsai/mod
claude plugin install my-questions --marketplace Mengchutsai/mod
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `Mengchutsai/mod` → **Add plugin**.
