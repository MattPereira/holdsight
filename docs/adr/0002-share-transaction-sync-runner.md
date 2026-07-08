# Shared Transaction History Sync Runner

Transaction History Sync should keep Vercel Workflows as the background runtime and use one shared runner abstraction with provider-specific adapters for page processing, lease completion, failure handling, and throttling. This keeps provider checkpoint logic in the page processors while removing duplicated orchestration loops from individual sync entry points.

We considered replacing Workflows with a database-driven job loop plus cron, but that would rebuild durable background execution, retry/recovery behavior, and scheduling without a concrete pain that justifies owning that infrastructure.
