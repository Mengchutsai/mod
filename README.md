# Claude Code mods

| Mod | What it does |
| --- | --- |
| **token-buddy** | A cute critter in a side panel showing how much context, 5-hour and weekly usage you have left. `/tokens` reopens it. |
| **my-questions** | A side panel listing every question you asked in the session; click one to jump to it in the chat. `/questions` reopens it. |
| **maryville-theme** | Maryville University maroon and red in the transcript, in the terminal and the desktop app: tool rows with icons and timings, edit diff cards, shell output cards, your own messages in a red frame, brand spinner words. `/maryville` (dark) or `/maryville light` also installs a matching terminal theme into `~/.claude/themes/`; `/maryville off` restores Claude Code's own drawing, `/maryville band` toggles a usage band above the prompt, `/maryville status` reports what it is drawing. In the desktop app, text follows the app's own light or dark appearance. |
| **clipboard** | A Clipboard side panel for snippets you want to hold on to across sessions, one list per project folder. A red **keep** button under every reply files that reply; the panel also keeps Claude's last answer or a note you type, and each clip has copy and delete links. `/keep <text>` files any text, `/keep answer` the last reply, `/keep export` writes everything to `clipboard.md` in the project folder, `/keep clear` empties it; `/clipboard` reopens the panel. In the terminal, **Keep selection** files whatever you highlighted with the mouse. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install token-buddy --marketplace Mengchutsai/mod
/plugin install my-questions --marketplace Mengchutsai/mod
/plugin install maryville-theme --marketplace Mengchutsai/mod
/plugin install clipboard --marketplace Mengchutsai/mod
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install token-buddy --marketplace Mengchutsai/mod
claude plugin install my-questions --marketplace Mengchutsai/mod
claude plugin install maryville-theme --marketplace Mengchutsai/mod
claude plugin install clipboard --marketplace Mengchutsai/mod
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `Mengchutsai/mod` → **Add plugin**.
