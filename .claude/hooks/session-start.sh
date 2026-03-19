#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# ── Remind Claude of CLAUDE.md rules ──────────────────────────────────────────
cat >&2 << 'RULES'
╔══════════════════════════════════════════════════════════════╗
║              CLAUDE.md — RULES FOR THIS SESSION              ║
╠══════════════════════════════════════════════════════════════╣
║  BRANCH WORKFLOW                                             ║
║  • Always start a NEW branch from latest main               ║
║  • Branch names: claude/<feature>-<sessionId>               ║
║  • After a PR merges: delete remote + local branch          ║
║    NEVER reuse old branches                                  ║
║                                                              ║
║  TESTING                                                     ║
║  • Every code change needs a new/updated unit test           ║
║  • Run `npm test` after every commit                         ║
║  • Fix failing tests in the implementation, not the test     ║
║                                                              ║
║  GIT PUSH                                                    ║
║  • Always: git push -u origin <branch-name>                  ║
╚══════════════════════════════════════════════════════════════╝
RULES

# ── Install dependencies ───────────────────────────────────────────────────────
cd "$CLAUDE_PROJECT_DIR"
npm install
