# 04: Real terminal pane

**What to build:** Opening a terminal in a workspace gives a live PowerShell in that folder that resizes with the pane, keeps its output when remounted, and stops when closed.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] PTY Manager test: `echo hi` → `hi`; kill → exit; buffer replay
- [ ] xterm.js pane wired over IPC with fit-on-resize
