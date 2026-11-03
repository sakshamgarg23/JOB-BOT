# Jobdesk — local job application assistant

A working TypeScript, Next.js, Tailwind, SQLite and Node.js/Playwright app. Includes a **job-specific resume tailor** with separate PDF and text downloads.

The current source hub adds consulting/IT services employer priorities, supported career-board collectors, shared hiring-post extraction, source freshness/provenance and explainable risk flags. See [SOURCES.md](SOURCES.md) for exact collector coverage, connection limits and checks.

The local candidate profile can be prefilled from your supplied resume, with a one-time review before verification. Missing compensation, authorization and experience totals remain unknown. All demo jobs are labeled fictional; test candidate facts exist only in isolated test databases.

## Double-click launch

Use **Start Jobdesk.cmd** in this folder to start the app and worker in the background and open the dashboard. Use **Stop Jobdesk.cmd** to stop the processes started by the launcher. Reopening the launcher reuses a healthy app and worker. Logs are in .local/. The launcher uses the production build; after changing application code, stop Jobdesk and run npm run build once before reopening it.

On first use, open **My profile**, review the prefilled resume facts and check the confirmation box, then save. Next import a job and choose **Prepare application**. Matching, answer preparation and resume tailoring are automatic after that action; real-platform submission still requires the original application link. Demo automation is available separately and labeled clearly.

## Background job discovery and native auto-apply

The **Automation** tab controls a scheduled worker pipeline: read public job APIs, filter target roles, deduplicate, score verified profile matches, and automatically shortlist and prepare eligible applications with job-specific resumes. Enable it once; the local app and worker must remain running. Unknown country eligibility and hard match blocks prevent unattended preparation. Your prefilled resume profile needs one-time review and saving before preparation can use its facts.

Remotive software-development jobs are fetched at most once per six hours; repeated checks use cached data. Jobs link back to Remotive with source attribution, and may be delayed by 24 hours. Optional Greenhouse company board tokens add public Job Board API discovery. A feed's update timestamp is never treated as its posting date, and fetching public jobs does not authorize application submission.

For Naukri account auto-apply, Naukri advertises its own **Neo** agent through Naukri360 Pro. The Automation tab links to its official setup. Activate and configure Neo in your signed-in Naukri account; this local app does not have access to your Naukri session and does not claim to control or track Neo. No Naukri plan is purchased by the app. LinkedIn account auto-apply is not supported because its terms prohibit unauthorized bot activity. This project does not provide a cross-platform universal auto-submit bot.

Sources: [Remotive public API terms](https://github.com/remotive-com/remote-jobs-api), [Greenhouse Job Board API](https://docs.greenhouse.io/job-board), [Naukri Neo](https://www.naukri.com/naukri360/neo-auto-apply-job-agent), [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement).

## Windows setup

Install Node.js 22.13+ (Node 22 LTS recommended). No Docker or paid services required.

~~~powershell
Set-Location 'E:\OneDrive\Desktop\job bot'
npm install
Copy-Item .env.example .env
npm run db:setup
npx playwright install chromium
npm run dev
~~~

Open **http://127.0.0.1:3000**. In a second terminal:

~~~powershell
Set-Location 'E:\OneDrive\Desktop\job bot'
npm run worker
~~~

Alternatively, set PLAYWRIGHT_CHANNEL=msedge in .env to use installed Microsoft Edge instead of downloading Chromium. Restart the worker after changing environment settings. Node 22 may print an experimental SQLite warning.

For production mode, stop the dev server first:

~~~powershell
npm run build
npm start
~~~

The worker runs separately. Stop both with Ctrl+C. To change the port, set JOBDESK_BASE_URL in .env and use the matching port argument: npm run dev -- --port 3001.

## Complete workflow

1. **My profile:** upload PDF, DOCX, TXT or Markdown, or paste resume text. Read the original extracted text. Enter your contact details, skills, experience, employment, projects, education and reusable answers from your source. Check the verification box and save. Editing any field clears verification until reviewed again.
2. **Jobs inbox:** paste a job description, a single job-alert email, or import CSV. Review individual extraction suggestions before saving. Dates, eligibility and missing values remain explicit.
3. Open a role for explainable matching. Shortlist or **Prepare application** to generate a complete answer preview and tailored resume.
4. Review every answer. Unknown questions become **Needs Input**: add an exact reusable answer in My profile, verify and save, then refresh preparation. “Why this role?” is a company/role-specific draft unless you have a saved answer.
5. **Real jobs:** download the resume, copy reviewed answers and open the manual application link. Record your observed outcome with confirmation evidence. These are labeled user-recorded outcomes.
6. **Demo:** choose **Try the local demo**, enable its adapter in Preferences, and run the worker. Prepare, **Fill demo & stop**, review the evidence, then approve demo submission. Submitted requires matching browser confirmation and a stored receipt.

The fill-only task uses an ephemeral headless browser, verifies its filled fields, attaches the actual tailored PDF, and closes without submitting. You review the complete application preview and fill evidence; a live browser session is not retained.

## Resume changer

- Resume Studio keeps multiple original extracted-text sources and job-specific versions.
- Tailoring uses your **saved verified profile**, not unreviewed extraction. Select a source original for reference in My profile.
- Relevant verified skills come first. Projects and existing bullet lines are ranked by required-skill overlap. Employment order, titles, organizations, dates, education and bullet wording are preserved.
- Missing qualifications and invented metrics are never inserted. Update verified source bullets yourself before regenerating.
- Review and download a multipage PDF or UTF-8 text. Refreshing preparation creates a new version while keeping earlier versions.
- Original resume recommendations use textual skill overlap; they are not an ATS guarantee.
- PDF uses standard Helvetica and replaces unsupported characters with "?"; text preserves Unicode.
- Imports retain selectable text, not original binaries, formatting, pictures or layout. Keep source files separately. Scanned PDFs require external OCR.
- This is conservative factual tailoring through reordering, not free-form AI rewriting.

## Imports and matching

Example CSV:

~~~csv
title,company,location,description,url,source,sourceId,postedAt,receivedAt
Frontend Developer,Example,Remote - India,"Requirements: React and JavaScript. Experience: 0-3 years.",https://example.com/jobs/42,Email alert,42,2026-10-30,2026-11-01
~~~

Only description is required. Quotes support multiline text, dates use ISO format, and imports allow up to 500 rows. CSV returns per-row results without the individual extraction review screen; review imported jobs in the inbox. Authorized feed/API exports can use this format; the app does not fetch arbitrary URLs.

Dates are separate: postedAt is explicitly supplied, receivedAt is explicitly supplied email receipt time, and discoveredAt is the actual app import timestamp. No dates are inferred from discovery. Relative posting-date labels require manual conversion.

Deduplication uses canonical URLs with tracking parameters removed, supplied source-plus-job IDs, or a fingerprint for identical no-URL descriptions. Same company/title/location with different identifiers is flagged as a likely duplicate and blocks automation until reviewed.

Extraction is heuristic and recognizes a common developer-skill vocabulary. Review required versus preferred skills, dates, salary units, experience and country eligibility. Manual fields accept additional skills.

Match score: required skills 55, target title 15, experience 10, eligible location 10, comparable salary 5, preferred skills 5. Undisclosed salary does not block a job. Generic “remote” is unknown; India/worldwide differs from country-restricted remote. Salary currencies and pay periods must match for comparison.

## Supported integrations

| Source | Supported behavior |
| --- | --- |
| Manual job description / URL | Extract, review, match, prepare, link to manual application |
| Pasted alert email | One-role text extraction; provide receipt date explicitly |
| CSV / authorized feed exports | Batch import with row results and deduplication |
| Remotive public API | Scheduled live discovery and automatic preparation; source links preserved |
| Greenhouse public boards | Scheduled discovery for configured boards; no authenticated application submission |
| Local demo | Real Playwright fill, PDF attachment, review stop, approved/eligible automatic submit, receipt verification |
| Naukri | Imported text/alerts locally; native Neo setup link for users with Pro |
| LinkedIn, Wellfound, Instahyre | Imported text/alerts and manual preparation only |
| Gmail | Not connected; paste alerts or import CSV |
| Other real platforms | Manual preparation only |

No real-platform account login, scraping or submission adapter is shipped. Public API documentation was reviewed for discovery; LinkedIn terms and Naukri's Neo feature were reviewed separately. No custom real-platform submission method is enabled. Future submission adapters need their own rules review, implementation and confirmation tests.

Automatic mode is opt-in and **demo-only**. It requires an enabled adapter, current verified profile, verified required answers (no drafts), no missing skills or hard blocks, the minimum score and no likely duplicate. Unknown required experience or location eligibility also prevents automatic mode. Evaluation happens when preparing; changing Settings does not submit previous preparations.

The worker never navigates to imported URLs. No CAPTCHA/MFA bypass, stealth, proxy rotation, external session or external account credential is used. Unsupported questions pause preparation; the sandbox has no CAPTCHA/MFA integration.

## Submission recovery

A unique application per job, unique active task and unique receipt prevent duplicate tasks and confirmations. Every execution validates the profile hash against the prepared snapshot. Profile changes require regeneration; adapter permission is rechecked before submit.

The worker looks for existing receipts before submission. It does not automatically retry a timeout. Interrupted submissions become **Submission Uncertain** unless a receipt exists. Use **Check stored demo receipt** to reconcile. If no confirmation exists, inspect manually and explicitly record an outcome before refreshing preparation. Applying, Submitted and Submission Uncertain applications cannot be re-prepared.

On restart, stale running submissions are reconciled or marked uncertain. Heartbeats prevent two active workers from claiming tasks. Activity and fixed, credential-free errors appear in Worker activity.

## Storage and privacy

SQLite initializes automatically; npm run db:setup verifies it. WAL and transactions support the web/worker pair. Default state is .local/jobdesk.sqlite and includes profile, extracted resumes, jobs, applications, tasks, receipts, settings and bounded activity logs.

.local/, .env, browser state and test artifacts are ignored by Git. No platform password or browser session is required or persisted. Keep optional service credentials in the server environment, never profile fields, source or NEXT_PUBLIC variables. Provider errors are reduced to fixed warnings; request headers, tokens and browser diagnostics are not logged.

**This workspace is in OneDrive and may be synced by Windows.** To keep data outside that folder, set JOBDESK_DATA_DIR in .env to a private local path such as C:/Users/YOUR_USER/AppData/Local/Jobdesk before starting both processes. Files inherit Windows permissions. SQLite and environment files are not encrypted in this MVP.

Stop both processes before backing up the complete data directory, including any WAL/SHM files. The server binds loopback and validates Host/Origin against cross-origin browser mutations. It is a local single-user app, without multi-user authentication; do not bind it publicly.

## Optional configurable AI

Local tailoring works without AI. An optional JSON service can use any model internally to rank **existing fact IDs**. Set AI_RANKING_URL and AI_RANKING_KEY in .env, restart the server and explicitly enable consent in Preferences.

The server POSTs JSON with an optional Authorization: Bearer header:

~~~json
{
  "task": "rank_facts",
  "job": { "title": "Frontend Developer", "requiredSkills": ["React"] },
  "facts": [{ "id": "entry-id:0", "text": "Created React interfaces." }]
}
~~~

Return every supplied ID exactly once:

~~~json
{ "orderedIds": ["entry-id:0"] }
~~~

Only bullet text, IDs, title and skill requirements are sent. Structured contact, compensation and authorization fields, credentials and sessions are excluded. Review bullets for sensitive information before enabling this option. Invalid IDs, timeouts (12 seconds), redirects and failures fall back to local ordering. Returned prose is never used, so the endpoint cannot add qualifications. A vendor-specific gateway is required; this is not a direct chat-completions integration. No external AI provider was tested during delivery.

## Tests and implementation

~~~powershell
npm run typecheck
npm test
npm run build
# Use installed Edge, or install Chromium first:
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
~~~

E2E starts a production server on port 3101 and separate worker, uses an isolated .local/e2e-* database, runs actual browser interactions and stops its processes. Build first; it tests the built version. E2E_PORT changes the test port.

Core tests cover matching, country restrictions, salary, dates/preferred skills, CSV, canonical/likely duplicates, unknown answers, factual resume preservation, approval/snapshot checks, automatic mode and receipt reconciliation. E2E covers profile editing, upload and PDF re-import, job import, browser fill, review stop, approval, receipt, duplicate blocks, cross-origin protection and mobile overflow. Screenshots go to test-results/.

Key files:
- app/workspace.tsx, app/panels.tsx, app/globals.css: dashboard and editing flows.
- app/api/[...path]/route.ts: validated local API.
- lib/jobs.ts, lib/resume.ts, lib/applications.ts: imports, matching, tailoring and application rules.
- lib/db.ts: SQLite schema and transactions.
- worker/index.ts, worker/adapters/demo.ts: queue and demo adapter.
- app/demo/[id]/: local sandbox.

Technical references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Playwright browser configuration](https://playwright.dev/docs/browsers).

