# Cloud deployment

Target: Vercel Hobby frontend, Google AI Studio Starter Tier backend with a durable database, and an external scheduled refresh. No billing upgrade is required or authorized for this deployment.

## Readiness

- Frontend: standalone build and read-only Vercel proxy prepared and locally tested.
- Backend: the existing local server still uses SQLite and process timers. Cloud migration is pending.
- Historical data: retained on the development computer; not committed to this repository.
- Deployment: no public production URL has been verified yet.

## Deployment order

1. Import this private GitHub repository into Google AI Studio Build using Add files (+) → Import from GitHub. Grant access only to this repository if prompted.
2. Provision a Starter Tier durable database. Migrate the summary store and checkpoint updates transactionally; seed it from the installed aggregate database. Do not upload the multi-gigabyte raw index. Keep local history intact until cloud totals, boundaries and hashes are verified.
3. Run an authenticated cloud HTTP backend on the platform's assigned PORT, listening on 0.0.0.0. Preserve the API responses used by the frontend. Adapt indexing to bounded scheduled requests with durable checkpoints and a writer lease. A background timer alone will not keep running while Cloud Run is idle.
4. Configure backend-only provider credentials and separate secrets for the frontend proxy and scheduled job. Never use NEXT_PUBLIC_ or VITE_ prefixes for secrets. Do not paste credentials in prompts, source files or commits.
5. In AI Studio choose Publish → Get started → Publish app using Starter Tier. If asked to enable billing, stop; that is outside this deployment's zero-cost constraint. Review any account terms yourself.
6. Verify the backend's public health endpoint, authenticated reads, saved history after a cold restart, and successive scheduled checkpoint advances.
7. Import this repository into Vercel on Hobby. Framework preset: Other. Root directory: repository root. The checked-in vercel.json sets install, build and output settings. Use Node 24.
8. Add server-only Vercel variables PERPL_BACKEND_URL (the backend HTTPS origin, without a path) and PERPL_BACKEND_TOKEN (matching the backend read token). Then deploy. Neither value is bundled into the browser.
9. Configure a free external scheduler to call the authenticated update endpoint every five minutes. For cron-job.org, requests must finish within its 30-second limit; save each bounded batch before returning. Do not schedule the old 45-minute local cycle through it.
10. Check data timestamps, automatic updates without an open browser, source rate limits, wallet reads, and theme/mobile layouts on the deployed URL.

Steps 2–6 require the cloud backend migration; importing the repository alone does not complete them. Free quotas limit capacity. Five-minute scheduling does not guarantee chain catch-up until throughput is measured.

## Why separate services?

Vercel Hobby is suitable for the static frontend and short request proxy. Its daily-only Hobby cron and ephemeral filesystem do not support the existing persistent SQLite indexer with five-minute scheduling. Google Starter Tier supplies a managed Cloud Run environment and supported durable databases without a billing account for eligible users. Additional services cannot simply be enabled in that managed project.

## Official references

- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/kb/guide/is-sqlite-supported-in-vercel
- https://ai.google.dev/gemini-api/docs/aistudio-deploying
- https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- https://docs.cloud.google.com/docs/starter-tier
- https://cron-job.org/en/faq/
