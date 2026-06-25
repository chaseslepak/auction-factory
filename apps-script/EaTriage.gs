/**
 * EA Triage — Phase 0 proof
 * ============================================================================
 * A Google Apps Script that lives inside Lauren's Google account and acts as a
 * read-and-draft-only executive assistant for inbound mail.
 *
 * THE GATE (hard guardrail)
 * -------------------------
 * This script may ONLY: read mail, read calendar, apply labels, and create
 * drafts. It must NEVER send, reply, forward, archive, mark read, or delete.
 * Every reply it writes lands in Gmail Drafts for a human to send. This is
 * non-negotiable and is the whole point of the proof.
 *
 * The only Gmail mutations performed anywhere in this file are:
 *   - thread.addLabel(...)            (apply a label)
 *   - GmailApp.createDraft(...) /     (create a draft reply)
 *     thread.createDraftReply(...)
 * There are deliberately NO calls to .send(), .reply(), .forward(),
 * .moveToArchive(), .markRead(), .moveToTrash(), or .remove*().
 * The one outbound email — the daily digest to Lauren/Chase — is a separate,
 * explicitly-intended summary and is the sole exception, by spec.
 *
 * APPROVAL MODEL = BOTH
 * ---------------------
 * Purvey reviews/repairs the drafts, Lauren sends. In Phase 0 both work the
 * same Drafts folder; the two-role split is a Phase 1 platform feature.
 * ============================================================================
 */

// ============================================================================
// CONFIG CONSTANTS — Lauren's onboarding data plugs in here
// ============================================================================

/** Emails/domains: top customers, key partners, Chase. */
const VIP_SENDERS = [
  // "chase@porkkinggood.com",
  // "bigcustomer.com",
];

/** Newsletter/vendor domains to auto-hold. */
const HOLD_SENDERS = [
  // "mailchimp.com",
  // "news.somevendor.com",
];

/** 2–3 of Lauren's actual sent emails, pasted, so the model learns her voice. */
const VOICE_SAMPLES = `/* Paste 2-3 of Lauren's real sent emails here. */`;

/** Freeform: what Lauren wants pinged vs. cleared. */
const ROUTING_NOTES = `/* Freeform routing preferences from Lauren. */`;

/** Daily digest recipients. */
const SUMMARY_RECIPIENTS = ["lauren@porkkinggood.com", "chase@porkkinggood.com"];

/** Hour (in Lauren's timezone) the daily summary fires. */
const SUMMARY_HOUR = 18; // 6:00 PM

// ----------------------------------------------------------------------------
// Internal constants
// ----------------------------------------------------------------------------

const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6"; // Escalate to claude-opus-4-8 only if voice isn't landing.
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MAX_TOKENS = 1024;

const SHEET_NAME = "EA Log";
const SHEET_HEADERS = ["Timestamp", "Sender", "Route", "Confidence", "Reason"];

const PROP_API_KEY = "ANTHROPIC_API_KEY";
const PROP_LAST_RUN = "lastRunTimestamp";
const PROP_LOG_SHEET_ID = "EA_LOG_SHEET_ID";

const LABELS = {
  needsLauren: "EA/Needs Lauren",   // client queue (needs her judgment)
  purveyReview: "EA/Purvey Review", // Purvey handles/QAs first
  hold: "EA/Hold",                  // no action needed
  drafted: "EA/Drafted",            // a reply draft was created
  waitingOn: "EA/Waiting On",       // follow-up tracking
};

const WAITING_ON_DAYS = 3; // threads from Lauren w/ no reply for >= this many days
const MAX_THREADS_PER_RUN = 50; // safety cap per triage run

// ============================================================================
// TRIGGER SETUP
// ============================================================================

/**
 * One-time setup. Run manually once (authorize as Lauren) to install both
 * time-driven triggers. Safe to re-run — it clears existing EA triggers first.
 */
function setupTriggers() {
  // Remove any of our existing triggers so re-running doesn't duplicate them.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === "runTriage" || fn === "sendDailySummary") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Triage: every 5 minutes.
  ScriptApp.newTrigger("runTriage")
    .timeBased()
    .everyMinutes(5)
    .create();

  // Summary: daily ~6:00 PM Lauren's timezone (the script's project timezone).
  ScriptApp.newTrigger("sendDailySummary")
    .timeBased()
    .atHour(SUMMARY_HOUR)
    .everyDays(1)
    .create();

  Logger.log("Triggers installed: runTriage (every 5 min), sendDailySummary (daily @ %s:00).", SUMMARY_HOUR);
}

// ============================================================================
// TRIAGE — the per-message flow, every 5 minutes
// ============================================================================

/**
 * Time-driven entry point. Processes inbox threads newer than the last run.
 */
function runTriage() {
  var props = PropertiesService.getScriptProperties();
  var lastRun = Number(props.getProperty(PROP_LAST_RUN)) || 0;
  var runStartedAt = nowMs_();

  ensureLabels_();
  var calendarContext = getTodaysCalendarContext_();

  // Gmail search granularity is seconds; subtract a small buffer to avoid
  // missing messages that arrived in the same second as the last run.
  var afterSeconds = lastRun > 0 ? Math.floor(lastRun / 1000) - 1 : Math.floor(runStartedAt / 1000) - 600;
  var query = "in:inbox after:" + afterSeconds;

  var threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
  Logger.log("Triage: query=[%s] matched %s thread(s).", query, threads.length);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    try {
      // Only act on threads whose newest message arrived after the last run.
      if (thread.getLastMessageDate().getTime() <= lastRun) {
        continue;
      }
      processThread_(thread, calendarContext);
    } catch (err) {
      Logger.log("Triage error on thread %s: %s", safeThreadId_(thread), err);
    }
  }

  // Advance the watermark only after a full pass so nothing is skipped on error.
  props.setProperty(PROP_LAST_RUN, String(runStartedAt));
}

/**
 * Classify + (optionally) draft a reply for a single thread.
 */
function processThread_(thread, calendarContext) {
  var msgs = thread.getMessages();
  var msg = msgs[msgs.length - 1]; // newest message in the thread

  var senderRaw = msg.getFrom();
  var senderEmail = extractEmail_(senderRaw);

  // Don't triage threads where Lauren/PKG sent the last message — those are
  // handled by the follow-up scan, not by drafting a reply to ourselves.
  if (isOwnAddress_(senderEmail)) {
    return;
  }

  var ctx = {
    sender: senderRaw,
    senderEmail: senderEmail,
    subject: msg.getSubject(),
    snippet: truncate_(msg.getPlainBody(), 4000),
    threadAgeDays: daysBetween_(thread.getFirstMessageDate().getTime(), nowMs_()),
    isVip: matchesList_(senderEmail, VIP_SENDERS),
    isHold: matchesList_(senderEmail, HOLD_SENDERS),
    calendar: calendarContext,
  };

  var result = classifyWithClaude_(ctx);

  // Apply route label.
  var label = labelForRoute_(result.route);
  thread.addLabel(label);

  // Create a draft reply if requested.
  if (result.needs_reply && result.draft_reply) {
    createDraftReply_(thread, msg, result.draft_reply);
    thread.addLabel(getLabel_(LABELS.drafted));
  }

  // Audit log.
  appendLog_([
    new Date(),
    senderRaw,
    result.route,
    result.confidence,
    result.reason,
  ]);
}

/**
 * Create a Gmail draft reply on the thread. NEVER sends.
 */
function createDraftReply_(thread, srcMsg, body) {
  // createDraftReply keeps the draft attached to the thread and pre-fills the
  // recipient/subject as a reply. It does NOT send.
  thread.createDraftReply(body);
}

// ============================================================================
// CLAUDE API CALL
// ============================================================================

/**
 * Call Claude with the message + calendar context + Lauren's config.
 * Returns a normalized result object (always safe to use downstream).
 * On any failure, routes to purvey_review with low confidence rather than guessing.
 */
function classifyWithClaude_(ctx) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(PROP_API_KEY);
  if (!apiKey) {
    Logger.log("Missing %s in Script Properties — routing to Purvey Review.", PROP_API_KEY);
    return fallbackResult_("API key not configured");
  }

  var system = buildSystemPrompt_();
  var userContent = buildUserMessage_(ctx);

  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: system,
    messages: [{ role: "user", content: userContent }],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var resp = UrlFetchApp.fetch(CLAUDE_ENDPOINT, options);
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log("Claude HTTP %s: %s", code, truncate_(resp.getContentText(), 500));
      return fallbackResult_("Claude API error " + code);
    }

    var json = JSON.parse(resp.getContentText());
    var text = extractClaudeText_(json);
    var parsed = parseModelJson_(text);
    return normalizeResult_(parsed);
  } catch (err) {
    Logger.log("Claude call failed: %s", err);
    return fallbackResult_("Claude call exception");
  }
}

/** Pull the concatenated text from a Claude messages-API response. */
function extractClaudeText_(json) {
  if (!json || !json.content || !json.content.length) return "";
  var out = [];
  for (var i = 0; i < json.content.length; i++) {
    var block = json.content[i];
    if (block && block.type === "text" && block.text) out.push(block.text);
  }
  return out.join("\n");
}

/**
 * Parse model output defensively: strip stray markdown fences, then JSON.parse.
 * Throws if it cannot recover JSON (caller falls back).
 */
function parseModelJson_(text) {
  var cleaned = String(text || "").trim();

  // Strip ```json ... ``` or ``` ... ``` fences if the model added them.
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();

  // If there's surrounding prose, grab the outermost {...}.
  if (cleaned.charAt(0) !== "{") {
    var first = cleaned.indexOf("{");
    var last = cleaned.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      cleaned = cleaned.substring(first, last + 1);
    }
  }

  return JSON.parse(cleaned);
}

/** Build the system prompt: voice + routing rules + VIP list + JSON contract. */
function buildSystemPrompt_() {
  return [
    "You are an executive assistant triaging Lauren's inbound email for Pork King Good (PKG).",
    "You classify each message, decide how to route it, and — when appropriate — draft a reply in Lauren's voice.",
    "",
    "=== LAUREN'S VOICE (match tone, length, and sign-off) ===",
    VOICE_SAMPLES,
    "",
    "=== ROUTING NOTES (Lauren's preferences) ===",
    ROUTING_NOTES,
    "",
    "=== VIP SENDERS (treat with priority) ===",
    VIP_SENDERS.join(", ") || "(none configured)",
    "",
    "=== ROUTING GUIDANCE (tunable) ===",
    "- Low confidence in your classification -> route 'purvey_review'.",
    "- VIP sender -> route 'needs_lauren', urgency 'high'.",
    "- Routine vendor / newsletter / no action needed -> route 'hold'.",
    "- Anything asking a direct question of Lauren -> needs_reply: true.",
    "- If a draft is warranted, write it in Lauren's voice; otherwise draft_reply is null.",
    "",
    "=== JSON CONTRACT ===",
    "Respond with JSON ONLY. No preamble, no explanation, no markdown code fences.",
    "Return exactly this shape:",
    "{",
    '  "category": "string (e.g. customer, vendor, internal, newsletter, personal)",',
    '  "urgency": "high | normal | low",',
    '  "confidence": "high | medium | low",',
    '  "route": "needs_lauren | purvey_review | hold",',
    '  "needs_reply": true,',
    '  "draft_reply": "string in Lauren\'s voice, or null",',
    '  "reason": "one line, why this route"',
    "}",
  ].join("\n");
}

/** Build the per-message user turn. */
function buildUserMessage_(ctx) {
  return [
    "Triage this inbound email.",
    "",
    "Sender: " + ctx.sender,
    "Sender is VIP: " + (ctx.isVip ? "yes" : "no"),
    "Sender is on auto-hold list: " + (ctx.isHold ? "yes" : "no"),
    "Subject: " + ctx.subject,
    "Thread age (days): " + ctx.threadAgeDays,
    "",
    "Today's calendar (so you can flag if the sender has a meeting with Lauren today):",
    ctx.calendar,
    "",
    "Message body:",
    "\"\"\"",
    ctx.snippet,
    "\"\"\"",
    "",
    "Return the JSON object only.",
  ].join("\n");
}

/** Normalize/validate a parsed model object into a safe result. */
function normalizeResult_(parsed) {
  var validRoutes = { needs_lauren: 1, purvey_review: 1, hold: 1 };
  var route = String(parsed && parsed.route || "").toLowerCase();
  if (!validRoutes[route]) route = "purvey_review";

  var confidence = String(parsed && parsed.confidence || "").toLowerCase();
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    confidence = "low";
  }

  var draft = parsed && parsed.draft_reply;
  if (draft === undefined || draft === null || draft === "null" || String(draft).trim() === "") {
    draft = null;
  }

  return {
    category: String(parsed && parsed.category || "unknown"),
    urgency: String(parsed && parsed.urgency || "normal").toLowerCase(),
    confidence: confidence,
    route: route,
    needs_reply: !!(parsed && parsed.needs_reply),
    draft_reply: draft,
    reason: String(parsed && parsed.reason || "no reason given"),
  };
}

/** Safe fallback when the model can't be trusted: Purvey Review, low confidence. */
function fallbackResult_(reason) {
  return {
    category: "unknown",
    urgency: "normal",
    confidence: "low",
    route: "purvey_review",
    needs_reply: false,
    draft_reply: null,
    reason: "Auto-routed to Purvey Review: " + reason,
  };
}

// ============================================================================
// CALENDAR CONTEXT
// ============================================================================

/**
 * Pull today's calendar events once per run. Returns a compact text block,
 * including attendee emails so the model can flag "sender has a meeting today."
 */
function getTodaysCalendarContext_() {
  try {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var end = new Date();
    end.setHours(23, 59, 59, 999);

    var events = CalendarApp.getDefaultCalendar().getEvents(start, end);
    if (!events.length) return "(no events today)";

    var lines = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var guests = [];
      try {
        var g = e.getGuestList();
        for (var j = 0; j < g.length; j++) guests.push(g[j].getEmail());
      } catch (gErr) {
        // Guest list can throw on some event types; ignore.
      }
      lines.push(
        "- " + formatTime_(e.getStartTime()) + " " + e.getTitle() +
        (guests.length ? " [attendees: " + guests.join(", ") + "]" : "")
      );
    }
    return lines.join("\n");
  } catch (err) {
    Logger.log("Calendar read failed: %s", err);
    return "(calendar unavailable)";
  }
}

// ============================================================================
// FOLLOW-UP TRACKING — runs once/day as part of the summary
// ============================================================================

/**
 * Scan threads where the last message is from Lauren/PKG (she sent, no reply)
 * and it's been >= WAITING_ON_DAYS. Apply EA/Waiting On. Returns the list for
 * the digest.
 */
function scanWaitingOn_() {
  var waiting = [];
  var label = getLabel_(LABELS.waitingOn);
  var cutoffDays = WAITING_ON_DAYS;

  // Sent threads older than the cutoff are candidates.
  var query = "in:sent older_than:" + cutoffDays + "d";
  var threads = GmailApp.search(query, 0, 100);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    try {
      var msgs = thread.getMessages();
      var last = msgs[msgs.length - 1];
      var lastFrom = extractEmail_(last.getFrom());

      // Last message must be from us (no one has replied since).
      if (!isOwnAddress_(lastFrom)) continue;

      var daysOut = daysBetween_(last.getDate().getTime(), nowMs_());
      if (daysOut < cutoffDays) continue;

      thread.addLabel(label);
      waiting.push({
        to: firstRecipient_(last),
        subject: thread.getFirstMessageSubject(),
        daysOut: daysOut,
      });
    } catch (err) {
      Logger.log("Waiting-on scan error: %s", err);
    }
  }
  return waiting;
}

// ============================================================================
// DAILY SUMMARY — the digest
// ============================================================================

/**
 * Time-driven entry point. Compiles the end-of-day digest and sends ONE email
 * to Lauren, cc Chase. (This is the single intended outbound email; all reply
 * drafting elsewhere is draft-only.)
 */
function sendDailySummary() {
  ensureLabels_();

  var stats = countLabelsToday_();
  var needsLaurenItems = collectNeedsLauren_();
  var draftCount = GmailApp.getDraftMessages().length;
  var waiting = scanWaitingOn_();
  var lowConfidence = collectLowConfidence_();

  var subject = "EA Daily Digest — " + formatDate_(new Date());
  var body = buildDigestBody_(stats, needsLaurenItems, draftCount, waiting, lowConfidence);

  // Single outbound email — the digest. To Lauren, cc Chase.
  var to = SUMMARY_RECIPIENTS[0];
  var cc = SUMMARY_RECIPIENTS.slice(1).join(",");
  GmailApp.sendEmail(to, subject, body, { cc: cc, name: "EA Triage" });

  Logger.log("Daily digest sent to %s (cc %s).", to, cc);
}

/** Count of threads carrying each EA label, scoped to today. */
function countLabelsToday_() {
  return {
    handled: countQuery_('label:"' + LABELS.needsLauren + '" OR label:"' + LABELS.purveyReview + '" OR label:"' + LABELS.hold + '" newer_than:1d'),
    drafted: countQuery_('label:"' + LABELS.drafted + '" newer_than:1d'),
    needsLauren: countQuery_('label:"' + LABELS.needsLauren + '" newer_than:1d'),
    held: countQuery_('label:"' + LABELS.hold + '" newer_than:1d'),
  };
}

/** Collect the "Needs Lauren now" bullets from today's labeled threads. */
function collectNeedsLauren_() {
  var items = [];
  var threads = GmailApp.search('label:"' + LABELS.needsLauren + '" newer_than:1d', 0, 25);
  var draftedLabelName = LABELS.drafted;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    var msg = msgs[msgs.length - 1];
    var hasDraft = threadHasLabel_(thread, draftedLabelName);
    items.push({
      sender: msg.getFrom(),
      ask: truncate_(oneLine_(thread.getFirstMessageSubject()), 120),
      draftReady: hasDraft,
    });
  }
  return items;
}

/** Anything the AI flagged low-confidence today (routed to Purvey Review). */
function collectLowConfidence_() {
  var count = countQuery_('label:"' + LABELS.purveyReview + '" newer_than:1d');
  return count;
}

/** Assemble the scannable plain-text digest. */
function buildDigestBody_(stats, needsLauren, draftCount, waiting, lowConfidence) {
  var lines = [];
  lines.push("EA Daily Digest — " + formatDate_(new Date()));
  lines.push("");
  lines.push("COUNTS (last 24h)");
  lines.push("  New handled:  " + stats.handled);
  lines.push("  Drafted:      " + stats.drafted);
  lines.push("  Needs Lauren: " + stats.needsLauren);
  lines.push("  Held:         " + stats.held);
  lines.push("");

  lines.push("NEEDS LAUREN NOW");
  if (!needsLauren.length) {
    lines.push("  (nothing in your queue)");
  } else {
    for (var i = 0; i < needsLauren.length; i++) {
      var it = needsLauren[i];
      lines.push("  - " + it.sender + " — " + it.ask + " (draft ready? " + (it.draftReady ? "y" : "n") + ")");
    }
  }
  lines.push("");

  lines.push("DRAFTS WAITING TO SEND");
  lines.push("  " + draftCount + " draft(s). Review/send: https://mail.google.com/mail/u/0/#drafts");
  lines.push("");

  lines.push("WAITING ON (no reply " + WAITING_ON_DAYS + "+ days)");
  if (!waiting.length) {
    lines.push("  (none)");
  } else {
    for (var w = 0; w < waiting.length; w++) {
      var item = waiting[w];
      lines.push("  - " + item.to + " — \"" + item.subject + "\" (" + item.daysOut + " days out)");
    }
  }
  lines.push("");

  lines.push("LOW-CONFIDENCE (AI wasn't sure — in Purvey Review)");
  lines.push("  " + lowConfidence + " item(s) routed to Purvey Review for a human check.");

  return lines.join("\n");
}

// ============================================================================
// LABEL HELPERS
// ============================================================================

/** Create any EA labels that don't yet exist. */
function ensureLabels_() {
  Object.keys(LABELS).forEach(function (k) {
    getLabel_(LABELS[k]);
  });
}

/** Get (creating if needed) a Gmail label by name. */
function getLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

/** Map a route string to its label object. */
function labelForRoute_(route) {
  if (route === "needs_lauren") return getLabel_(LABELS.needsLauren);
  if (route === "hold") return getLabel_(LABELS.hold);
  return getLabel_(LABELS.purveyReview); // purvey_review + any unknown
}

/** Does a thread carry the given label name? */
function threadHasLabel_(thread, name) {
  var labels = thread.getLabels();
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].getName() === name) return true;
  }
  return false;
}

// ============================================================================
// AUDIT LOG (EA Log Google Sheet)
// ============================================================================

/** Append a one-line audit entry to the EA Log sheet. */
function appendLog_(row) {
  try {
    getLogSheet_().appendRow(row);
  } catch (err) {
    Logger.log("Log append failed: %s | row=%s", err, JSON.stringify(row));
  }
}

/** Get (creating + caching if needed) the EA Log spreadsheet's first sheet. */
function getLogSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_LOG_SHEET_ID);
  var ss;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      ss = null; // stale id; recreate below
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    props.setProperty(PROP_LOG_SHEET_ID, ss.getId());
    var sheet0 = ss.getSheets()[0];
    sheet0.appendRow(SHEET_HEADERS);
  }

  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(SHEET_HEADERS);
  return sheet;
}

// ============================================================================
// SMALL UTILITIES
// ============================================================================

function nowMs_() {
  return new Date().getTime();
}

function daysBetween_(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function truncate_(s, n) {
  s = String(s || "");
  return s.length > n ? s.substring(0, n) : s;
}

function oneLine_(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** Extract a bare email address from a "Name <email>" string. */
function extractEmail_(from) {
  var m = String(from || "").match(/<([^>]+)>/);
  var email = m ? m[1] : String(from || "");
  return email.trim().toLowerCase();
}

/** First recipient of a message (for waiting-on display). */
function firstRecipient_(msg) {
  var to = msg.getTo() || "";
  return extractEmail_(to.split(",")[0]) || to;
}

/** Does this address belong to Lauren / PKG (i.e. "us")? */
function isOwnAddress_(email) {
  email = String(email || "").toLowerCase();
  // The mailbox owner's own address always counts as "us".
  var me = "";
  try {
    me = Session.getActiveUser().getEmail().toLowerCase();
  } catch (e) {
    me = "";
  }
  if (me && email === me) return true;
  return email.indexOf("@porkkinggood.com") !== -1;
}

/** Does an email/domain match any entry in a list (exact email or domain)? */
function matchesList_(email, list) {
  email = String(email || "").toLowerCase();
  for (var i = 0; i < list.length; i++) {
    var entry = String(list[i] || "").toLowerCase().trim();
    if (!entry) continue;
    if (entry.indexOf("@") !== -1) {
      if (email === entry) return true; // full address
    } else if (email.indexOf("@" + entry) !== -1 || email === entry) {
      return true; // domain match
    }
  }
  return false;
}

function countQuery_(q) {
  try {
    return GmailApp.search(q, 0, 200).length;
  } catch (err) {
    Logger.log("countQuery failed [%s]: %s", q, err);
    return 0;
  }
}

function safeThreadId_(thread) {
  try {
    return thread.getId();
  } catch (e) {
    return "(unknown)";
  }
}

function formatTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "HH:mm");
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "EEE, MMM d yyyy");
}
