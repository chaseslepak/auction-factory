# EA Triage — Phase 0

A read-and-draft-only executive assistant for Lauren's inbox, built as a Google
Apps Script that runs **inside Lauren's Google account** (native `GmailApp` +
`CalendarApp`, no OAuth-app plumbing).

## The gate (non-negotiable)

The script may only **read mail, read calendar, apply labels, and create
drafts**. It never sends, replies, forwards, archives, marks read, or deletes.
Every reply lands in Gmail Drafts for a human to send. The only outbound email
is the daily digest, which is explicitly intended.

Approval model = **Both**: Purvey reviews/repairs drafts, Lauren sends. In
Phase 0 both work the same Drafts folder.

## Setup (Chase logs in as Lauren once)

1. Create a new Apps Script project at <https://script.google.com> while signed
   in as Lauren. Paste `EaTriage.gs` in as the project code.
2. **Project Settings → Script Properties**, add:
   - `ANTHROPIC_API_KEY` — Lauren's/PKG's Claude API key. **Never hardcode it.**
   (`lastRunTimestamp` and `EA_LOG_SHEET_ID` are managed automatically.)
3. Set the project **timezone** (Project Settings) to Lauren's timezone so the
   6:00 PM summary fires correctly.
4. Fill in the config constants at the top of `EaTriage.gs`:
   - `VIP_SENDERS`, `HOLD_SENDERS`, `VOICE_SAMPLES`, `ROUTING_NOTES`,
     `SUMMARY_RECIPIENTS`, `SUMMARY_HOUR`.
5. Run `setupTriggers` once and approve the OAuth scopes when prompted. This
   installs:
   - `runTriage` — every 5 minutes
   - `sendDailySummary` — daily at `SUMMARY_HOUR`
6. First run auto-creates the Gmail labels and the `EA Log` Google Sheet.

## What it does

- **Every 5 min (`runTriage`)**: for each new inbox thread since the last run,
  pulls sender/subject/body/age + today's calendar, asks Claude
  (`claude-sonnet-4-6`) to classify and (when warranted) draft a reply in
  Lauren's voice, applies the route label, creates a Gmail draft + `EA/Drafted`
  label if needed, and appends an audit row to the `EA Log` sheet.
- **Daily (`sendDailySummary`)**: runs the follow-up scan (`EA/Waiting On` for
  threads Lauren sent with no reply in 3+ days) and emails one scannable digest
  to Lauren, cc Chase.

## Labels (the Phase 0 queue)

- `EA/Needs Lauren` — client queue (her judgment)
- `EA/Purvey Review` — Purvey handles/QAs first (also where low-confidence goes)
- `EA/Hold` — no action needed
- `EA/Drafted` — a reply draft was created
- `EA/Waiting On` — follow-up tracking

## Tuning

- Escalate `CLAUDE_MODEL` to `claude-opus-4-8` only if draft quality in Lauren's
  voice isn't landing.
- Routing guidance lives in `buildSystemPrompt_()` and is meant to be tuned.
