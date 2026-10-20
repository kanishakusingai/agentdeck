# 09: Usage-limit handling

**What to build:** When an agent pane prints a usage-limit message, a banner offers "Resume when it resets" (auto-sends continue at the reset time when known) or "Continue on another account" (new pane on that account, seeded with a handoff summary).

**Blocked by:** 08, 10

**Status:** done

- [x] Detector test with literal Claude/Codex limit messages
- [x] Handoff summary written and referenced in the new agent's prompt
