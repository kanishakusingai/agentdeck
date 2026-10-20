# Spec: AgentDeck — personal agent super app

Status: done

## Problem Statement

I use several AI coding agents (Claude Code, Codex, OpenCode, …) from separate terminal windows. I lose track of which agent is doing what, I can't see their work side by side with a preview of my app, I hit usage limits and get stuck, I can't easily read back what an agent did, and I have to type every prompt. I'm not a developer, so I want one friendly window that does all of this for me on Windows.

## Solution

A native desktop app (Electron) modelled on BridgeMind. A title-bar switch moves between three modes:

- **Code** — workspaces in a left rail, each with a canvas of real terminal panes I can split, snap and tidy; one-click launch of any agent on my PATH; a right sidebar with a docked browser and a dashboard of running agents.
- **Thread** — the agents' sessions shown as readable conversations.
- **Agent** — routines: saved prompts that run on a schedule, with their results.

Across modes: multiple named accounts per provider with a default and overrides, a usage-limit banner that offers "resume later" or "continue on another account", and hold-to-talk dictation that runs locally with an optional "Enhance Prompt".

## User Stories

1. As a user, I want the app to open as a dark, polished window with a custom title bar, so that it feels like a real tool.
2. As a user, I want a switch in the title bar for Agent / Code / Thread, so that I can change what I'm doing in one click.
3. As a user, I want the left rail, main area and composer to change with the mode, so that each mode shows only what matters.
4. As a user, I want my last mode remembered, so that the app reopens where I left it.
5. As a user, I want to add a folder as a workspace with a native folder picker, so that agents work on my real files.
6. As a user, I want to remove a workspace, so that the rail stays tidy.
7. As a user, I want workspaces remembered across restarts, so that I don't re-add them.
8. As a user, I want to rename a workspace, so that I can tell projects apart.
9. As a user, I want to open a terminal in a workspace, so that I have a real shell in that folder.
10. As a user, I want the terminal to resize with its pane, so that output isn't cut off.
11. As a user, I want closing a pane to stop its process, so that nothing keeps running invisibly.
12. As a user, I want terminal output kept if I switch workspaces and come back, so that I don't lose context.
13. As a user, I want to split panes right or down, so that I can watch several agents at once.
14. As a user, I want to drag panes to rearrange and dock them, so that I can arrange my canvas.
15. As a user, I want layout presets (single, 2-up, 4-up), so that I get a clean grid fast.
16. As a user, I want a Tidy button, so that a messy layout snaps back to an even grid.
17. As a user, I want each workspace's open panes nested under it in the rail, so that I can jump to any pane.
18. As a user, I want the canvas layout remembered per workspace, so that it survives restarts.
19. As a user, I want the app to detect which agents are installed, so that I only see what I can run.
20. As a user, I want a "Launch agent" menu listing Claude Code, Codex, Gemini CLI, Cursor Agent, Copilot, Grok, Droid, OpenCode, Kimi, Amp, Antigravity, Aider, so that I can start any of them in one click.
21. As a user, I want a launched agent to run in a new terminal pane in the workspace folder, so that its changes land on my disk.
22. As a user, I want the shell to stay open after the agent exits, so that I can keep working in it.
23. As a user, I want to rescan for agents, so that newly installed tools show up.
24. As a user, I want a docked browser in the right sidebar, defaulting to http://localhost:3000, so that I can preview my app next to the agent building it.
25. As a user, I want a URL bar, back/forward and reload in the browser, so that I can navigate.
26. As a user, I want to open a browser as a pane on the canvas too, so that I can make it big.
27. As a user, I want a dashboard listing every running pane with its agent, workspace, account and status, so that I see everything at a glance.
28. As a user, I want to click a dashboard row to focus that pane, so that I can jump to it.
29. As a user, I want to add named Claude and Codex accounts in Settings → Agents, so that I can use work and personal subscriptions.
30. As a user, I want each account to sign in through the provider's own login in its own folder, so that the app never sees my tokens.
31. As a user, I want to pick a default account per provider, so that new agents use it automatically.
32. As a user, I want to override the account per workspace, so that a client project uses the client's account.
33. As a user, I want to choose the account when launching a single agent, so that I can override per pane.
34. As a user, I want to see which account each pane uses, so that I know who is being billed.
35. As a user, I want the app to notice when an agent hits a usage limit, so that I'm not left staring at a dead terminal.
36. As a user, I want a banner offering "Resume when it resets" or "Continue on another account", so that a limit becomes a choice.
37. As a user, I want "continue on another account" to start the agent on that account with a summary of the conversation, so that work carries on.
38. As a user, I want "resume later" to send "continue" automatically when the limit resets (if the time is known), so that I don't have to watch the clock.
39. As a user, I want Thread mode to list my agents' sessions grouped by workspace, newest first, so that I can find what happened.
40. As a user, I want a session shown as a readable conversation (my prompts, the agent's replies, tool calls collapsed), so that I read instead of watch.
41. As a user, I want sessions from every account included, so that nothing is missing.
42. As a user, I want to search threads by text, so that I can find a past conversation.
43. As a user, I want to open a thread from a pane, so that I can read what that agent did.
44. As a user, I want to hold a key, speak, and release to get text, so that I don't have to type prompts.
45. As a user, I want the text to go into the focused terminal pane or text field, so that it lands where I'm working.
46. As a user, I want transcription to run on my machine, so that my audio never leaves my computer.
47. As a user, I want to see the speech model download progress the first time, so that I know it's working.
48. As a user, I want a recording indicator while I hold the key, so that I know it's listening.
49. As a user, I want to change the push-to-talk key, so that it doesn't clash with my habits.
50. As a user, I want "Enhance Prompt" to turn my rambling into a clear brief using my own Claude or Codex account, so that agents get better instructions.
51. As a user, I want to create a routine with a name, prompt, workspace, agent, account and schedule, so that agents work while I'm away.
52. As a user, I want schedules like "every N minutes", "daily at a time" and "weekdays at a time", so that I don't need to learn cron.
53. As a user, I want a "Run now" button, so that I can test a routine.
54. As a user, I want to pause/resume and delete routines, so that I control them.
55. As a user, I want each run's status, time and output saved and listed in Agent mode, so that I can read results later.
56. As a user, I want to choose whether a routine may edit files, so that read-only routines are safe.
57. As a user, I want keyboard shortcuts for common actions (new terminal, split, switch mode, settings), so that I can move fast.
58. As a user, I want a Settings page for accounts, voice, terminal font size and shell, so that I can adjust the app.
59. As a user, I want a Windows installer, so that I can install it like any other app.
60. As a user, I want clear empty states ("Add your first workspace"), so that I always know the next step.

## Implementation Decisions

- **Process model:** Electron main process owns all OS access; the renderer is a React app with `contextIsolation` on, `nodeIntegration` off and `sandbox` on; a preload exposes one typed `window.api` object. All IPC channels and payload types live in a shared types module.
- **Build:** electron-vite (main, preload, renderer), React 19, TypeScript, Tailwind v4. UI components are shadcn-style copy-in components built on Radix primitives and lucide icons. Zustand for renderer state.
- **Persistence (deviation from plan):** a small JSON-file store module in the main process (atomic write) instead of electron-store, because electron-store is ESM-only and adds bundling risk. Interface: `get(key)`, `set(key, value)`, typed by a schema of keys (workspaces, layouts, accounts, routines, runs, settings, ui).
- **PTY Manager (main):** spawns a shell via node-pty (`@lydell/node-pty`, prebuilt N-API binaries, no Visual Studio needed). Interface: `create({cwd, command?, env?, cols, rows}) → id`, `write`, `resize`, `kill`, `onData`, `onExit`, `getBuffer(id)`. Keeps a capped scrollback buffer per PTY so a remounted terminal can replay output. Agents run as `powershell -NoLogo -NoExit -Command <agent command>` so the shell survives the agent.
- **Agent catalog + detector (main):** a static catalog of known agents (id, label, command, provider) and a detector that scans PATH × PATHEXT. Pure function with injectable PATH for tests.
- **Account Manager (main):** accounts `{id, provider: 'claude'|'codex', name, configDir}`; config dirs under the app's data folder. `envFor(account)` returns `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. A "System" pseudo-account (no env override) uses the user's existing login. Resolution order for a launch: explicit pane choice → workspace override → provider default → System. Sign-in opens a terminal pane running the provider's own login with that env. Tokens are never read.
- **Usage-limit detector:** pure function over terminal output (ANSI stripped) returning `{limited, resetAt?}`; matches known Claude and Codex limit phrases. The main process watches each agent PTY and emits an event; the renderer shows the banner.
- **Handoff:** builds a markdown summary from the pane's latest transcript (or recent terminal output when no transcript is found), writes it to the app's data folder, and launches the agent on the chosen account with a prompt pointing at that file.
- **Transcript Reader (main):** discovers Claude Code sessions (`<configDir>/projects/**/*.jsonl`) for the System account and every Claude account, and Codex sessions (`<CODEX_HOME>/sessions/**/*.jsonl`). Parses into a common `Thread {id, agent, cwd, title, updatedAt, messages[]}` where messages are `user | assistant | tool` with text. Unknown lines are skipped.
- **Routines + Scheduler (main):** schedule model `{kind:'interval', minutes} | {kind:'daily', time:'HH:MM', days:number[]}`; pure `nextRun(schedule, from)`; a scheduler ticks every 30 s and executes due routines. A run spawns the agent headlessly (`claude -p`, `codex exec`, …) through PowerShell with a fixed command string; the prompt is passed on stdin (no user text in the command line). Runs are stored with status, start/end, exit code and output (capped).
- **Enhance Prompt:** same headless runner with a fixed instruction, prompt on stdin, returns rewritten text.
- **Dictation (renderer):** MediaRecorder → decode at 16 kHz → Whisper (`@huggingface/transformers`, `whisper-base` ONNX) in a Web Worker. A small push-to-talk state machine (idle → recording → transcribing → idle) is a pure reducer. Model files download once from Hugging Face and are cached by the browser cache; audio never leaves the machine.
- **Canvas:** dockview per workspace; panel kinds `terminal | browser | thread`. Layout serialized per workspace. Presets and Tidy rebuild the grid from the current panel list.
- **Browser:** Electron `<webview>` in its own persistent partition, no node integration.
- **Packaging:** electron-builder, Windows NSIS installer into `release/`.

## Testing Decisions

Good tests exercise external behaviour through each module's public interface and assert values from an independent source (literal fixtures), not re-computations.

Seams (chosen up front, user asked not to be quizzed):

1. **Store** — set/get round-trips survive a new instance on the same folder. Misses: concurrency.
2. **PTY Manager** — real PowerShell: `echo hi` → output contains `hi`; kill → exit event; buffer replays. Misses: rendering.
3. **Agent detector** — fake PATH dir with `claude.cmd` → detected, absent tools not. Misses: version checks.
4. **Account resolution + env** — pane > workspace > default > System; correct env var per provider.
5. **Usage-limit detector** — literal sample messages → limited (+ reset time); normal output → not.
6. **Transcript parser** — fixture JSONL for Claude and Codex → expected messages.
7. **Scheduler** — `nextRun` for interval/daily/weekday literals; scheduler executes due routine once and persists run (fake clock, fake runner).
8. **Push-to-talk reducer** — key down/up and transcription results drive the expected states.
9. **E2E (Playwright Electron)** — window opens; mode switch changes panels; add workspace (dialog stubbed) → terminal works; screenshots captured for visual review.

## Out of Scope

Sign-up/login to AgentDeck, billing, credits, cloud sync, marketing site, auto-update, macOS/Linux installers (code stays cross-platform where cheap), global (outside-the-app) hotkeys, cloud transcription, voice orchestration of agents.

## Further Notes

The user is not a developer: every empty state and error must say plainly what to do next. No screenshots of BridgeMind were available; visual direction comes from the site's description (dark, dense, calm, terminal-first).

## Decisions made during implementation

Recorded after `/code-review`; each was a deliberate call, not drift.

- **No user text on command lines.** Terminal panes start agents with only the detected executable path and fixed, app-defined arguments. The handoff prompt is typed into the agent's input once its UI settles, never passed as an argument.
- **Continue on another account opens a new pane** beside the limited one, so the old scrollback stays readable.
- **Restored agent panes resume.** After a restart, an agent pane relaunches its agent with the CLI's own "continue latest conversation" flag (`claude --continue`, `codex resume --last`); plain terminals come back as fresh shells.
- **Usage-limit detection** only looks at the last ~600 characters of output, and a dismissed notice stays quiet for 30 minutes for that pane.
- **Thread search** matches titles, folders and conversation text; threads group under a workspace when their folder is the workspace or any subfolder.
- **Extras kept:** a speech-model picker (tiny/base/small, default base.en), an Enhance Prompt agent picker that may fall back to Gemini CLI, removing an account deletes its sign-in folder (after confirmation), removing a workspace pauses its routines.
- **Docked browser** runs in its own session partition with no device/location permissions.
