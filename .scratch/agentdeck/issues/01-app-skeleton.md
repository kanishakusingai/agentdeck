# 01: App skeleton with dark shell

**What to build:** Running the app opens a dark AgentDeck window with a custom title bar (drag region, minimise/maximise/close), backed by a secure preload API and a working test setup.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `npm run dev` opens the window; `npm run build` succeeds
- [ ] contextIsolation on, nodeIntegration off, sandbox on; typed `window.api`
- [ ] Vitest and Playwright-for-Electron run; e2e smoke test sees the title bar
- [ ] JSON store module with round-trip test
