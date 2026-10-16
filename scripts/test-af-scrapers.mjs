#!/usr/bin/env node
/**
 * AF scraper regression harness.
 *
 * Runs both src/lib/af-scraper.ts (public page parser) against saved
 * HTML fixtures and asserts parse counts stay above thresholds.
 * Catches silent "AF changed the markup" regressions BEFORE they ship
 * — the class of bug that caused the Oct 15 duplicate-upload disaster.
 *
 * Usage:
 *   node scripts/test-af-scrapers.mjs
 *
 * Fixtures live in scripts/scraper-fixtures/. Add new ones whenever
 * you suspect AF changed something: fetch the page, save the HTML
 * here, add an entry to EXPECTED below with the parse count you
 * manually verified against the live page.
 *
 * Exits non-zero if any expected count isn't met — wire into CI (or
 * just run before merging scraper edits).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'scraper-fixtures');

// Expected minimum item counts per fixture. Set to the count you
// manually verified on the live auction page when the fixture was
// captured. The test passes if the parser returns >= this many items.
const EXPECTED = {
  'archive_4945_small.html': 4,
  'archive_4852_big.html': 18,
  'live_4947_single.html': 1,
};

// Compile the parser inline — the lib imports Supabase types and
// Buffer that would break a bare dynamic import, so we compile just
// the parse function with tsx.
async function loadParser() {
  // Use tsx to resolve the TS module without a build step.
  // We expose parseAuctionItemsWithDiag via dynamic import.
  const scraperModule = await import(
    'file://' + join(__dirname, '..', 'src', 'lib', 'af-scraper.ts')
  );
  return scraperModule;
}

async function main() {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.html'));
  if (files.length === 0) {
    console.error('No fixtures found in', fixturesDir);
    process.exit(1);
  }

  let scraper;
  try {
    scraper = await loadParser();
  } catch (err) {
    console.error('Failed to import scraper lib:', err.message);
    console.error('Run via: npx tsx scripts/test-af-scrapers.mjs');
    process.exit(1);
  }

  // The scraper library doesn't export parseAuctionItemsWithDiag at
  // module level; it exports scrapeAuction (which does network IO).
  // To test the parser in isolation, we temporarily monkey-patch
  // global fetch to return each fixture's HTML.
  const originalFetch = globalThis.fetch;

  let anyFailed = false;
  for (const file of files) {
    const html = readFileSync(join(fixturesDir, file), 'utf8');
    const expected = EXPECTED[file];
    if (expected == null) {
      console.log(`  SKIP ${file} (no EXPECTED entry; add one)`);
      continue;
    }

    // Monkey-patch fetch to return this fixture on the first call,
    // then empty pages so pagination terminates.
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
    };

    try {
      const result = await scraper.scrapeAuction(
        'https://auctionfactory.com/auction_details.php?auction=0000',
        false
      );
      const count = result.items.length;
      const parseSource = result.parse_source || 'unknown';
      const pass = count >= expected;
      const marker = pass ? '✓' : '✗';
      console.log(
        `  ${marker} ${file}: parsed ${count} items (expected ≥${expected}), parse_source=${parseSource}`
      );
      if (!pass) anyFailed = true;
      if (parseSource === 'fallback') {
        console.log(
          `    WARNING: primary parser returned 0, fell back to item_detail.php anchors. ` +
          `AF markup may have shifted on this fixture — update the primary splitter.`
        );
      }
    } catch (err) {
      console.log(`  ✗ ${file}: threw — ${err.message}`);
      anyFailed = true;
    }
  }

  globalThis.fetch = originalFetch;

  if (anyFailed) {
    console.error('\n✗ Scraper regression detected. Investigate before merging.');
    process.exit(1);
  }
  console.log('\n✓ All fixtures parsed above threshold.');
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
