# Security and privacy

## Deployment safeguards

- Keep database credentials, provider tokens and scheduler tokens in server environment settings. Never prefix secrets with `NEXT_PUBLIC_` or `VITE_`.
- Environment files, local databases, logs, build outputs and tool state are excluded from Git. Check staged files and commit history before publication.
- Use different read and refresh tokens. The public API permits only named read routes; `/api/refresh` requires the scheduler token.
- Retain PostgreSQL certificate verification. The `perpl` schema is private and must not be exposed through Supabase's Data API or granted to anonymous clients.
- Do not give unreviewed preview deployments production credentials.
- Keep caches and indexing limits enabled, and monitor hosting quotas. Public wallet lookups can still consume provider resources.

## Public data

The application displays public blockchain addresses, activity and Perpl leaderboard data. It does not request private keys, seed phrases, wallet signatures or a connected wallet. Searches send the selected public address to the backend and relevant data providers, and responses may be cached.

Watchlists, recent searches and theme preferences use browser storage. Wallet URLs contain the selected address; share only addresses you intend to share. Hosting and data providers may retain ordinary request logs. External font requests are made to Google Fonts.

## Reporting

Use the repository's private vulnerability reporting feature if it is enabled. Do not put credentials, private configuration or exploit details in public issues. If a credential is accidentally published, revoke or rotate it promptly; deleting it from the latest file does not remove it from Git history.
