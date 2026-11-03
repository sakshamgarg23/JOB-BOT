# Sources, employer preferences and job checks

The Automation screen now separates **employer preference**, **source coverage**, **freshness**, **job fit**, and **risk signals**. Company recognition is not treated as proof of authenticity.

## Consulting and IT services focus

The editable preferred-employer list includes Accenture, Deloitte, TCS / Tata Consultancy Services, Infosys, Wipro, Capgemini, Cognizant, HCLTech, Tech Mahindra, IBM, LTIMindtree, Mphasis, Persistent Systems, EPAM, Thoughtworks, Sopra Steria, Version 1, Devoteam, Publicis Sapient, EY, PwC and KPMG.

Choose:
- Prefer: order preferred employers first.
- Only: collect and show only preferred employers.
- All: do not boost employer preferences.

Adding an employer name does not connect its careers site. A company watchlist is a preference, not a verified reputation ranking. No fake company-size, employee-rating or funding scores are generated.

## Working local collectors

| Source | Implementation and scope |
| --- | --- |
| Greenhouse | Public configured-company job boards |
| Lever | Public configured-company postings; undocumented posting dates remain unknown |
| Ashby | Public listed jobs for configured boards |
| SmartRecruiters | Company + country queries for React, frontend, JavaScript, Next.js and full stack; full detail fetch for up to 40 selected postings per company |
| HN Who is hiring | Bounded read of the latest monthly thread using the official Hacker News API; people-authored posts |
| Startup Jobs | Public engineering RSS, with source attribution and original links |
| Remotive | Existing software-development API, minimum six hours between network fetches |

Paste a supported career-board URL in **Add a company career page** to detect the collector and register its board. A supplied company name is a user-configured label, not independently verified employer ownership. Unsupported career systems produce an explicit message.

Some common example firms use different career systems or do not publish a usable board through these APIs. Empty API responses are not proof that a company is connected or hiring. No authentication is attempted and no private/internal posting token is used. SmartRecruiters queries are bounded and do not claim exhaustive company coverage.

## Explicit connection limits

- **LinkedIn jobs and people posts:** shared post URL + text extraction and imported alerts. No personal-feed or account crawler.
- **Naukri:** imported alerts and confirmations; Neo operates separately. No direct account job-feed connection.
- **YC:** the HN collector is the YC community's Who is hiring thread, **not the YC startup jobs portal**, and does not imply that a company is YC-backed.
- **Monster:** the connected chat search returned that India is unsupported; it supports US, Canada, UK, Ireland and selected European markets. No persistent local Monster collector.
- **YC and Wellfound provider option:** optional Fantastic.jobs `active-jb` collection, disabled by default. Configure the key and explicitly enable credit-consuming requests in Automation. One bounded page per 24 hours; no account login, expiry verification or submission support. Provider access does not establish original-source permission. Shared post/alert imports remain available.
- **Gmail:** the chat-assisted import already performed is one-time. It does not provide credentials to the local worker for recurring sync.

The Source connections panel reports these distinctions. A link, imported record or company name is never described as an authorized account connection.

## Freshness and availability

Posting time, email receipt time, first seen locally, last seen at source and last source check remain separate. Updates are not substituted for publication dates. Changed source dates and an old first-seen date can flag a possible repost.

Known postings outside the configured age window and senior/lead/staff/manager roles outside the junior range are excluded during collection. Unknown dates remain unknown and can be excluded from unattended preparation. The inbox has date and source filters.

Missing from a complete latest snapshot means **Not in latest source snapshot**; it does not prove that the job closed. Bounded RSS, HN and query collectors do not mark absent items as closed.

Repeated checks reuse caches until each source's minimum interval has elapsed. Polling is configurable from 30 to 360 minutes; Remotive always retains its six-hour minimum. Source failures do not silently turn old timestamps into fresh ones.

## Scam checks

Labels are **High risk**, **Needs review**, and **No obvious flags**. None means guaranteed genuine or confirmed fake. Explanations cover applicant payments/deposits, cryptocurrency task payments, check-deposit/equipment reimbursement wording, secret/early sensitive-ID requests, personal contact email, shortened links, internationalized domains, domain mismatch and no-interview/guaranteed-selection claims.

No-fee and secret-sharing warnings are excluded where recognizable. These are conservative heuristics and can have false positives or miss scams. Recruiter identity and hiring authority are not independently verified. A normal-looking source or preferred employer name does not establish legitimacy.

High-risk records never enter unattended preparation. Optionally skip all review-risk records as well. Incomplete descriptions, reposts, absent listings, hard match blocks, unknown eligibility and configured age limits also stop unattended preparation. A complete proposed application is still reviewable.

## Validation

Core tests cover public parsers, date preservation, risk negation and positive demands, domain mismatch, duplicate provenance, snapshot/repost state, supported URL boundaries and risk/freshness/seniority preparation blocks. Browser validation covers shared-post extraction, the visible risk label, source settings and inbox filters in addition to the original application demo.

References: [Ashby public jobs](https://developers.ashbyhq.com/docs/public-job-posting-api), [Lever postings](https://github.com/lever/postings-api), [SmartRecruiters public posting endpoints](https://developers.smartrecruiters.com/docs/endpoints), [Hacker News API](https://github.com/HackerNews/API), [Startup Jobs API and feeds](https://startup.jobs/api), [FTC job scam guidance](https://consumer.ftc.gov/articles/job-scams).

