---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
argument-hint: <file-or-pattern>
---

# Web interface review

Audit UI code against the rule list in `guidelines.md` (next to this file).

1. Work out which files to review: the argument if one was given, otherwise ask.
2. Read `guidelines.md` in full, then read each target file.
3. Check every rule that applies and report each violation as `file:line` plus a short fix,
   in the output format `guidelines.md` describes.

`guidelines.md` is a pinned copy of Vercel's Web Interface Guidelines (MIT, see `LICENSE`),
from https://github.com/vercel-labs/web-interface-guidelines at commit
4ecfb9fb8d1d3b7009674869b3aaee2f904042e1 (2026-10-05). Use the local copy; don't fetch the rules
at review time. To update, download the new `command.md`, review the diff, then replace the file.
