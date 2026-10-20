# 08: Multiple accounts

**What to build:** Settings → Agents lets me add named Claude and Codex accounts, sign each in through the provider's own login in its own folder, set a default per provider, override per workspace and pick per launch; panes show their account.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Resolution test: pane > workspace > default > System
- [ ] Env test: CLAUDE_CONFIG_DIR / CODEX_HOME set at spawn
- [ ] Tokens never read
