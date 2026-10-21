# Glossary

- **Workspace**: a folder on disk the user works in. Shown in the left rail; owns a pane canvas.
- **Session**: one screen of panes inside a workspace (up to 8 panes). A workspace has one or more sessions; the left rail lists them.
- **Pane**: one tile on a session's canvas. Kinds: terminal and thread. (Browsers live only in the sidebar; browser panes saved by older versions still reopen.)
- **Launch menu**: the one button that opens a new pane in the session — a plain terminal at the top, then ten agents (installed ones first), then **All agents**, the directory of every known agent CLI with how to install it.
- **Quick sessions**: the project "Continue without a project" opens — the user's own folder, no name to choose.
- **Sidebar**: the right-hand panel in Code mode: the dashboard plus one or more browser tabs. It is the only place a browser opens.
- **Terminal pane**: a live shell (PTY) whose cwd is the workspace folder.
- **Agent**: a CLI coding tool on PATH (Claude Code, Codex, Gemini CLI, …). Launching an agent opens a terminal pane running it.
- **Account**: a named sign-in for an agent provider (Claude or Codex), isolated in its own config folder. The app never reads or stores tokens.
- **System login**: the pseudo-account meaning "whatever the provider CLI is normally signed into on this PC" (no config-folder override).
- **Default account**: the account new agents use unless a workspace or pane overrides it.
- **Usage limit**: the provider message saying an account is out of quota. Becomes a choice: resume later or continue on another account.
- **Handoff summary**: a markdown file summarising a conversation, used to continue it on another account.
- **Thread**: a readable transcript of an agent session, parsed from the agent's own session files.
- **Routine**: a saved prompt + workspace + agent + account + schedule, run headlessly. Each execution is a **run**.
- **Mode**: Agent, Code or Thread. The title-bar switch changes the rail, the main area and the composer.
- **Dictation**: hold-to-talk speech-to-text that runs locally and inserts text into the focused pane or field.
- **Enhance Prompt**: rewrites dictated text into a clear brief using the user's own agent CLI headlessly.
