# HoldSight

Track portfolio allocations, document theses, and journal trade decisions.

![HoldSight portfolio overview](public/screenshots/portfolio.png)

## Overview

- Consolidates EVM wallets, Hyperliquid, Lighter, Kraken, Plaid, and Schwab through a shared adapter registry
- Tracks investment theses, targets, risks, and invalidation criteria
- Uses a durable, resumable sync pipeline with lease-based concurrency to ingest more than 2,100 transactions
- Structures daily, weekly, and monthly planning and reflection
- Exposes portfolio data to AI agents through a remote MCP server with self-hosted OAuth 2.1

### Theses

Define an investment case, compare target and current allocations, and record what would prove the thesis wrong.

![Investment thesis tracking in HoldSight](public/screenshots/theses.png)

### Journal

Connect portfolio activity to plans and reflections across daily, weekly, and monthly review cycles.

![Investment journal in HoldSight](public/screenshots/journal.png)

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Neon Postgres
- Drizzle ORM
- Better Auth
- Plaid
- Recharts
