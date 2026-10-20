# Domain Docs

Single-context layout: `GLOSSARY.md` and `docs/adr/` at the repo root.

## Before exploring, read these

- `GLOSSARY.md` at the repo root
- `docs/adr/`: ADRs that touch the area you're about to work in

If any of these files don't exist, proceed silently. `/domain-modeling` creates them lazily.

## Use the glossary's vocabulary

When your output names a domain concept (issue title, test name, refactor proposal), use the term as defined in `GLOSSARY.md`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
