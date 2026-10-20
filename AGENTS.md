# AgentDeck

Personal desktop "agent super app" (BridgeMind-style): Electron + React + TypeScript.

- `npm run dev` — run the app in development
- `npm run typecheck` — type-check main, preload and renderer
- `npm test` — unit tests (Vitest)
- `npm run test:e2e` — end-to-end tests (Playwright for Electron; builds first)
- `npm run dist` — build the Windows installer into `release/`

Layout: `src/main` (Electron main process: PTYs, agents, accounts, routines, transcripts, store), `src/preload` (typed contextBridge API), `src/renderer` (React UI), `src/shared` (types shared across processes).

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
