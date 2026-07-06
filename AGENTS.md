## Agent skills

### Issue tracker

Issues and PRDs are tracked with GitHub Issues; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical default triage labels are used. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context layout. See `docs/agents/domain.md`.

## Development Instructions
- Do not start the local development server. The user starts and manages dev server processes.
- After code changes, run `pnpm run check` for validation. Do not run `pnpm run build` unless explicitly requested.
- When making changes relevent to Nextjs: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
- When asked to commit changes, always use a concise commit message with descriptive body explaining the changes.
- Hermes Agent is the sole MCP client; return successful data as `structuredContent` with empty `content` to avoid duplicate payloads. Keep text `content` for errors or media/prose.
