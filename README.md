# Jobdesk

A local job application workspace for discovering opportunities, evaluating job fit, and preparing tailored resumes from verified candidate information.

Built with TypeScript, Next.js, React, Tailwind CSS, SQLite, and a separate Node.js worker with Playwright.

## Overview

Jobdesk combines job discovery, application preparation, and outcome tracking in one workspace. Supported public feeds can run on a schedule, while employer preferences, eligibility rules, and risk signals help prioritize relevant opportunities.

**Real applications are submitted through the original employer or platform page.** Automated browser submission is implemented only for the local demonstration environment.

| Capability | Current support |
| --- | --- |
| Job discovery | Scheduled public APIs and feeds, optional provider access, and manual imports |
| Job matching | Explainable scores for skills, role, experience, location, and salary |
| Resume tailoring | Factual reordering with separate PDF and text downloads |
| Application preparation | Verified reusable answers, draft responses, and missing-information checks |
| Real application submission | Manual submission and user-recorded outcomes |
| Browser automation | Local demonstration with approval, field verification, and receipt checks |

The interface uses locally hosted Poppins fonts. See [SOURCES.md](SOURCES.md) for detailed source coverage and collection limits.

## Getting started

### Requirements

- Node.js 22.13 or later and npm.
- Windows PowerShell for the included launchers and encrypted provider-key storage.
- Microsoft Edge or Playwright Chromium for the local browser demonstration.
- Internet access for external job sources and optional services.

The application and public collectors work without Docker, an AI service, or a paid subscription. The optional YC and Wellfound provider connection may require a paid plan.

### Installation

Run the following commands from the project root:

~~~powershell
npm install
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item .env.example .env
}
npm run db:setup
npx playwright install chromium
~~~

To use an existing Microsoft Edge installation instead of downloading Chromium, skip the final command and set `PLAYWRIGHT_CHANNEL=msedge` in `.env`.

### Start the application

Double-click **Start Jobdesk.cmd** to start the web application and worker in the background. The launcher creates an initial production build when one is missing, opens the dashboard, and reuses healthy running processes.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) if the browser does not open automatically.

Use **Stop Jobdesk.cmd** to stop processes managed by the launcher. Logs are stored in `.local/`. After changing application code, stop Jobdesk, run `npm run build`, and start it again.

### Development

Start the web application:

~~~powershell
npm run dev
~~~

Start the worker in a separate terminal:

~~~powershell
npm run worker
~~~

For a manual production launch, stop the development server and run:

~~~powershell
npm run build
npm start
~~~

The worker remains a separate process. Stop manually launched processes with **Ctrl+C**. After changing environment settings, restart both the web application and worker.

## Application workflow

1. **Verify the candidate profile.** Import a PDF, DOCX, TXT, or Markdown resume, or paste its text. Review the extracted source, complete the profile, and save its verification. Editing profile facts requires verification again.
2. **Configure preferences.** Set target roles, experience range, locations, salary preferences, and eligibility requirements in **Preferences**.
3. **Discover or import opportunities.** Configure collectors in **Automation**, connect supported company boards, or import job descriptions, shared hiring posts, and CSV files.
4. **Review job fit.** Inspect matching skills, missing requirements, source information, posting dates, duplicates, and risk explanations.
5. **Prepare the application.** Select **Prepare application** to generate a tailored resume and answer preview. Eligible public-source jobs can also be prepared by the scheduled worker.
6. **Resolve missing information.** Add exact reusable answers to **My profile**, verify the updated profile, and refresh preparation. Role-specific responses may remain drafts requiring review.
7. **Submit and record the result.** Download the resume, copy reviewed answers, and apply through the original page. Record the outcome with the confirmation evidence available.

Missing compensation, authorization, experience totals, and required answers remain unknown until supplied. Imports do not verify candidate facts automatically.

## Job discovery

### Supported sources

| Source | Collection method | Scope and limits |
| --- | --- | --- |
| Greenhouse | Public company job boards | Scheduled discovery for configured boards |
| Lever | Public company postings | Scheduled discovery; unsupported publication dates remain unknown |
| Ashby | Public listed openings | Scheduled discovery for configured boards |
| SmartRecruiters | Public company and country queries | Frontend-related searches; up to 40 posting details per company per run |
| Remotive | Public software-development API | Minimum six hours between network attempts; source attribution retained |
| Startup Jobs | Public engineering RSS | Bounded feed with original links and attribution |
| Hacker News | Official API for the latest Who is hiring thread | Bounded collection of people-authored hiring posts |
| YC and Wellfound | Optional Fantastic.jobs API | One bounded request per 24 hours when explicitly enabled |
| LinkedIn | Imported alerts or shared post text and URL | No account feed or people-post crawler |
| Naukri | Imported alerts and confirmations | No direct account feed; native Neo operates independently |
| Monster | Manual imports | No persistent local collector |
| Gmail | Pasted alerts or imported exports | No recurring mailbox connection in the local worker |
| Other sources | Job descriptions and CSV imports | No arbitrary URL crawling or platform submission adapter |

The HN thread is separate from the YC startup jobs portal and does not establish that a company is YC-backed.

### Configure company boards

In **Automation**, use **Add a company career page** to register a Greenhouse, Lever, Ashby, or SmartRecruiters board URL. The application detects the supported collector from the URL. Unsupported career systems require a separate implementation.

Use the preferred-employer list to prioritize consulting and IT services firms or other selected employers. Adding a company name changes ranking and collection preferences; it does not connect that company's careers site or verify an individual listing.

### Enable scheduled collection

In **Automation**:

1. Select the required collectors and company boards.
2. Enable **Run configured collectors while the worker is running**.
3. Configure match thresholds, posting-age limits, and preparation rules.
4. Select **Save automation settings**.
5. Use **Check now** to queue a collection run.

The application and worker must remain running for scheduled work. **Check now** respects source intervals and reuses cached records when another network attempt is not yet allowed.

Public-source polling is configurable from 30 to 360 minutes. Remotive retains its six-hour minimum, and the optional provider retains its daily minimum.

### Optional YC and Wellfound connection

The optional Fantastic.jobs integration is disabled by default and operates separately from platform accounts.

1. Review the [provider's plans](https://fantastic.jobs/api), [data-use terms](https://developer.fantastic.jobs/terms), and applicable original-source permissions.
2. Obtain a Fantastic.jobs API key with job-board access.
3. Open **Automation > Connect YC & Wellfound**.
4. Enter the key locally and select **Save provider key**.
5. Choose **YC and Wellfound**, **YC only**, or **Wellfound only**.
6. Enable daily provider collection and select **Save automation settings** with the main collectors enabled.
7. Select **Check now** and inspect **Last collection run**.

Saving a key does not validate live access, enable collection, or make a provider request. Do not share credentials in chat or commit them to source control.

| Setting | Behavior |
| --- | --- |
| Request interval | At most one attempt per rolling 24 hours, including failed attempts |
| Result limit | Default 25; configurable from 1 to 100 returned jobs |
| Pagination | One page; no additional pages or immediate retries |
| Discovery window | Provider listings indexed within its 24-hour feed window |
| Search scope | Frontend, React, Next.js, and full-stack titles in India, remote, or worldwide locations |
| Availability checks | Provider expiry checks are unavailable for these two sources |
| Preparation | Imported jobs support matching and manual resume preparation |
| Validation | Fixture tests, Windows key-storage checks, and browser setup flow; paid live access has not been verified |

Returned duplicates and jobs rejected by local filters may still consume provider credits. A bounded request can miss opportunities, particularly when the result limit is reached or the worker is offline for more than a day.

Provider indexing time is never substituted for publication time. Confirm availability on the original page before applying. Removing the saved key disables provider collection. Existing public collectors require no provider subscription.

## Resume tailoring

Tailoring uses the saved, verified profile as its factual source.

- Relevant verified skills appear first.
- Projects and existing bullet lines are ranked by overlap with job requirements.
- Employment order, titles, employers, dates, education, and bullet wording are preserved.
- Missing qualifications, invented metrics, and unsupported experience are not added.
- New preparation creates a separate resume version, preserving earlier versions.
- Resume Studio retains original extracted text and tailored versions with PDF and UTF-8 text downloads.

Imports retain selectable text, not original document binaries, formatting, images, or layout. Keep original files separately. Scanned PDFs require OCR before import.

PDF export uses standard Helvetica and replaces unsupported characters with `?`; text export preserves Unicode. Resume recommendations use textual skill overlap and do not guarantee ATS results.

## Matching, freshness, and risk

### Matching

The score allocates up to 55 points for required skills, 15 for target-role alignment, 10 each for experience and eligible location, and 5 each for comparable salary and preferred skills.

Undisclosed salary remains an uncertainty. Salary comparisons require compatible currency and pay period. Generic remote wording does not establish eligibility to work from India.

Extraction uses heuristics and a developer-skill vocabulary. Review required versus preferred skills, experience ranges, salary units, and country restrictions before preparing an application.

### Freshness and duplicates

Publication time, email receipt time, local discovery time, source checks, and last-seen observations remain separate. Source updates do not become publication dates.

Canonical URLs and source identifiers prevent exact duplicate imports. Matching company, title, and location with different identifiers can flag likely duplicates for review. A missing listing in a complete source snapshot does not prove closure; bounded collectors do not make that inference.

### Risk and preparation rules

Risk labels are **High risk**, **Needs review**, and **No obvious flags**. They reflect heuristic evidence and do not certify authenticity. Checks cover applicant-payment demands, requests for secrets, suspicious contact details, shortened links, and potential domain impersonation.

Scheduled preparation skips high-risk records, possible reposts, missing listings, incomplete descriptions, likely duplicates, and hard match blocks. Additional settings can exclude review-risk records, older postings, unknown dates, and senior titles. Unknown country eligibility prevents unattended preparation when India eligibility is required.

Automatic preparation covers eligible Remotive, Greenhouse, Lever, Ashby, SmartRecruiters, and Startup Jobs records. HN hiring posts and optional YC/Wellfound provider imports require manual preparation.

## Imports

Paste a job description or a single job-alert email, extract its fields, and review the suggestions before saving. Shared hiring posts accept the original URL and supplied post text without connecting the author's platform account.

CSV imports support up to 500 rows, quoted multiline descriptions, and per-row results:

~~~csv
title,company,location,description,url,source,sourceId,postedAt,receivedAt
Frontend Developer,Example Company,Remote - India,"Requirements: React and JavaScript. Experience: 0-3 years.",https://example.com/jobs/42,Email alert,42,2026-10-30,2026-11-01
~~~

Only `description` is required. Use ISO dates for `postedAt` and `receivedAt`; neither is inferred from import time. CSV imports bypass the individual extraction screen, so review imported jobs in the inbox.

## Local browser demonstration

The demonstration verifies the application workflow against a local form with fictional jobs.

1. Choose **Try the local demo** and enable its adapter in **Preferences**.
2. Prepare the application and select **Fill demo & stop**.
3. Review the answer preview, resume, and field-verification evidence.
4. Approve demo submission and inspect the stored receipt.

The fill-only task uses an ephemeral headless browser, attaches the tailored PDF, verifies the fields, and closes without submitting. No interactive browser session is retained.

Optional automatic demo submission requires a verified profile, exact verified answers, no missing required skills or hard blocks, the configured score, and no likely duplicate. Profile or adapter changes invalidate earlier approval.

A submission requires matching browser confirmation and a stored receipt. Interrupted submissions become **Submission Uncertain** unless a receipt can be reconciled. The worker does not retry uncertain submissions automatically.

No real-platform submission adapter, CAPTCHA or MFA bypass, stealth mechanism, or platform login session is included.

## Configuration and storage

| Setting | Purpose |
| --- | --- |
| `JOBDESK_DATA_DIR` | SQLite and application-data directory; defaults to `.local` |
| `JOBDESK_BASE_URL` | Local application URL; defaults to `http://127.0.0.1:3000` |
| `PLAYWRIGHT_CHANNEL` | Optional installed browser channel, such as `msedge` |
| `AI_RANKING_URL` | Optional server endpoint for ranking existing resume facts |
| `AI_RANKING_KEY` | Optional server credential for the ranking endpoint |

For a different port, update `JOBDESK_BASE_URL` and use the same port when starting the web server, for example `npm run dev -- --port 3001`. The Windows launcher reads the configured URL.

SQLite initializes automatically and stores the profile, extracted resumes, jobs, applications, tasks, receipts, settings, source observations, and activity logs. `npm run db:setup` verifies initialization.

The application binds to loopback and validates local Host and Origin headers. It is intended for a single local user and has no multi-user authentication.

Personal data in SQLite and environment files is not encrypted. The optional provider key is encrypted with Windows DPAPI for the current Windows account; the API returns only whether a key is configured. AI-service credentials remain in server environment variables.

`.local/`, `.env`, browser state under the local data directory, logs, and test artifacts are excluded from Git. Avoid storing credentials in profile fields, source files, or `NEXT_PUBLIC_*` variables.

A workspace inside OneDrive or another synced directory may be uploaded by that service. To relocate application data, set `JOBDESK_DATA_DIR` to a private local directory before starting both processes. Stop the application and worker before backing up the complete data directory, including SQLite WAL and SHM files.

## Optional AI integration

Resume tailoring works locally without AI. An optional JSON service can rank existing fact IDs; returned prose is never used to create new qualifications.

Set `AI_RANKING_URL` and, if required, `AI_RANKING_KEY` in `.env`. Restart the web application and worker, then enable AI in **Preferences**.

The server sends:

~~~json
{
  "task": "rank_facts",
  "job": {
    "title": "Frontend Developer",
    "requiredSkills": ["React"]
  },
  "facts": [
    {
      "id": "entry-id:0",
      "text": "Created React interfaces."
    }
  ]
}
~~~

The endpoint must return every supplied ID exactly once:

~~~json
{
  "orderedIds": ["entry-id:0"]
}
~~~

Only bullet text, fact IDs, job title, and required skills are included. Review source bullets for sensitive information before enabling an external service. Invalid IDs, redirects, errors, or a 12-second timeout fall back to local ordering.

The endpoint is a custom integration contract, not a direct chat-completions API. External AI-provider access has not been verified.

## Validation

~~~powershell
npm run typecheck
npm test
npm run build
# Use an installed Edge browser, or install Playwright Chromium first.
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
~~~

End-to-end checks use the production build, a separate worker, an isolated database, and port 3101 by default. Build before running them. Set `E2E_PORT` to use another port. Test processes are stopped after execution, and screenshots are written to `test-results/`.

Coverage includes matching, eligibility, CSV imports, duplicate detection, date preservation, factual resume tailoring, approval checks, receipt reconciliation, source parsing, risk rules, encrypted provider-key storage, and daily provider polling limits.

Browser checks cover profile review, resume import and PDF extraction, job imports, demonstration fill and submission, origin protection, provider-key save/removal, shared-post extraction, source settings, and mobile layout. Provider integration checks use fixtures and do not establish live subscription access.

## Project structure

| Path | Responsibility |
| --- | --- |
| `app/workspace.tsx`, `app/panels.tsx` | Dashboard, profile, resume, and settings flows |
| `app/automation-panel.tsx` | Source configuration and provider setup |
| `app/globals.css`, `app/fonts/` | Interface styles and locally hosted Poppins assets |
| `app/api/[...path]/route.ts` | Validated local API |
| `lib/jobs.ts`, `lib/resume.ts` | Import, matching, and resume preparation |
| `lib/automation.ts`, `lib/source-*.ts` | Scheduled discovery, source parsing, and coverage |
| `lib/fantastic-jobs.ts`, `lib/provider-key.ts` | Optional provider collector and Windows key storage |
| `lib/quality.ts`, `lib/observations.ts` | Risk, freshness, and provenance |
| `lib/applications.ts`, `lib/db.ts` | Application rules, persistence, and transactions |
| `worker/index.ts`, `worker/adapters/demo.ts` | Background worker and local browser adapter |
| `scripts/`, `tests/` | Launchers, setup, and validation |
| [SOURCES.md](SOURCES.md) | Detailed source capabilities and limitations |

