const express = require('express');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const AF_ADMIN = 'https://www.auctionfactory.com/admin';
const AF_EMAIL = process.env.AF_EMAIL || 'chase@auctionfactory.com';
const AF_PASSWORD = process.env.AF_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const USER_DATA_DIR = path.join(__dirname, '.browser-data');

let browser = null;
let context = null;
let isLoggedIn = false;
let loginRequired = false;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ensure browser data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    context = await browser.newContext({
      storageState: fs.existsSync(path.join(USER_DATA_DIR, 'state.json'))
        ? path.join(USER_DATA_DIR, 'state.json')
        : undefined,
    });
  }
  return context;
}

async function saveState() {
  if (context) {
    await context.storageState({ path: path.join(USER_DATA_DIR, 'state.json') });
  }
}

async function checkLogin() {
  const ctx = await getBrowser();
  const page = await ctx.newPage();
  try {
    await page.goto(`${AF_ADMIN}/auctions.php`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const url = page.url();
    // If we're on the login page or redirected, we're not logged in
    if (url.includes('index.php') || url.includes('Login') || url.includes('login')) {
      isLoggedIn = false;
      loginRequired = true;
      return false;
    }
    const content = await page.content();
    if (content.includes('psEmail') || content.includes('psPassword')) {
      isLoggedIn = false;
      loginRequired = true;
      return false;
    }
    isLoggedIn = true;
    loginRequired = false;
    await saveState();

    // Also store the cookies in Supabase for the Vercel API routes
    const cookies = await ctx.cookies();
    const phpSession = cookies.find(c => c.name === 'PHPSESSID');
    if (phpSession && SUPABASE_URL) {
      const cookieStr = `PHPSESSID=${phpSession.value}`;
      await supabase.from('af_session').upsert({
        id: 1,
        session_cookie: cookieStr,
        updated_at: new Date().toISOString(),
      });
    }

    return true;
  } catch (err) {
    console.error('Login check error:', err.message);
    return false;
  } finally {
    await page.close();
  }
}

async function uploadLot(lot, photos, afAuctionId) {
  const ctx = await getBrowser();
  const page = await ctx.newPage();

  try {
    // Navigate to add item page for this auction
    await page.goto(`${AF_ADMIN}/add_item.php?auction_id=${afAuctionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Check if we got redirected to login
    if (page.url().includes('index.php') || page.url().includes('Login')) {
      return { success: false, error: 'Session expired. Login required.' };
    }

    // Fill in the form fields
    // Item Name
    const nameInput = await page.$('input[name="item_name"], input[name="psItemName"], input[name="itemName"]');
    if (nameInput) {
      await nameInput.fill(lot.item_name || '');
    } else {
      // Try finding by label proximity
      const nameInputs = await page.$$('input[type="text"]');
      if (nameInputs.length > 0) await nameInputs[0].fill(lot.item_name || '');
    }

    // Item Description
    const descTextarea = await page.$('textarea');
    if (descTextarea) {
      await descTextarea.fill(lot.auction_description || '');
    }

    // Condition dropdown
    const conditionSelect = await page.$('select');
    if (conditionSelect) {
      const condMap = {
        10: '10', 9: '9', 8: '8', 7: '7', 6: '6',
        5: '5', 4: '4', 3: '3', 2: '2', 1: '1',
      };
      const val = condMap[lot.condition_rating] || '5';
      // Try to select by partial value match
      const options = await conditionSelect.$$('option');
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.startsWith(val)) {
          const value = await opt.getAttribute('value');
          await conditionSelect.selectOption(value);
          break;
        }
      }
    }

    // Make (brand)
    const makeInput = await page.$('input[name="make"], input[name="psMake"]');
    if (makeInput) await makeInput.fill(lot.brand || '');

    // Model
    const modelInput = await page.$('input[name="model"], input[name="psModel"]');
    if (modelInput) await modelInput.fill(lot.model || '');

    // QTY
    const qtyInput = await page.$('input[name="qty"], input[name="psQty"]');
    if (qtyInput) {
      await qtyInput.fill('');
      await qtyInput.fill(String(lot.quantity || 1));
    }

    // Original $
    const priceInput = await page.$('input[name="original_price"], input[name="psOriginalPrice"]');
    if (priceInput) await priceInput.fill(String(lot.estimated_retail_new || ''));

    // Starting Bid - set to $1.00
    const bidInput = await page.$('input[name="starting_bid"], input[name="psStartingBid"]');
    if (bidInput) {
      await bidInput.fill('');
      await bidInput.fill('1.00');
    }

    // Upload photos
    if (photos.length > 0) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        // Download photos to temp files
        const tempFiles = [];
        for (let i = 0; i < photos.length; i++) {
          const res = await fetch(photos[i].url);
          const buffer = Buffer.from(await res.arrayBuffer());
          const tempPath = path.join('/tmp', `lot_photo_${i}.jpg`);
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);
        }
        await fileInput.setInputFiles(tempFiles);
        // Clean up temp files
        for (const f of tempFiles) {
          try { fs.unlinkSync(f); } catch {}
        }
      }
    }

    // Click "Next Item" button
    const nextBtn = await page.$('input[value="Next Item"], button:has-text("Next Item")');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForLoadState('domcontentloaded');
    } else {
      // Try save & exit
      const saveBtn = await page.$('input[value="Save & Exit"], button:has-text("Save")');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    await saveState();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await page.close();
  }
}

// ---- API Endpoints ----

// Status check
app.get('/status', async (req, res) => {
  await checkLogin();
  res.json({ isLoggedIn, loginRequired });
});

// Get login page URL (user opens this in their browser on same network)
app.get('/login', async (req, res) => {
  res.send(`
    <html>
    <head><title>AF Worker - Login Required</title></head>
    <body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;">
      <h2>Auction Factory Login Required</h2>
      <p>The AF session has expired. Please log in:</p>
      <ol>
        <li>Go to <a href="${AF_ADMIN}" target="_blank">auctionfactory.com/admin</a> and log in</li>
        <li>Open your browser console (F12 > Console)</li>
        <li>Type <code>document.cookie</code> and copy the result</li>
        <li>Paste it below and click Submit</li>
      </ol>
      <form method="POST" action="/set-cookie">
        <textarea name="cookie" rows="3" style="width:100%;font-family:monospace;" placeholder="PHPSESSID=abc123..."></textarea>
        <br/><br/>
        <button type="submit" style="padding:10px 20px;background:#0B4F8B;color:white;border:none;border-radius:8px;cursor:pointer;">Submit Cookie</button>
      </form>
    </body>
    </html>
  `);
});

app.use(express.urlencoded({ extended: true }));

app.post('/set-cookie', async (req, res) => {
  const cookie = req.body.cookie;
  if (!cookie) return res.status(400).send('No cookie provided');

  try {
    // Parse the PHPSESSID from the cookie string
    const match = cookie.match(/PHPSESSID=([^;]+)/);
    if (!match) return res.status(400).send('No PHPSESSID found in cookie');

    const sessionId = match[1];

    // Set the cookie in the browser context
    const ctx = await getBrowser();
    await ctx.addCookies([{
      name: 'PHPSESSID',
      value: sessionId,
      domain: 'www.auctionfactory.com',
      path: '/',
    }]);
    await saveState();

    // Verify it works
    const loggedIn = await checkLogin();
    if (loggedIn) {
      res.send('<h2>Success! Connected to Auction Factory.</h2><p>You can close this tab.</p>');
    } else {
      res.send('<h2>Cookie did not work. Please try again.</h2><a href="/login">Back</a>');
    }
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Process upload queue
app.post('/process-queue', async (req, res) => {
  if (!isLoggedIn) {
    await checkLogin();
    if (!isLoggedIn) {
      return res.status(401).json({ error: 'Not logged in to AF. Visit /login to connect.' });
    }
  }

  try {
    // Get queued lots
    const { data: lots, error } = await supabase
      .from('lots')
      .select('*, lot_photos(*), auctions!inner(id, name), af_auction_map:af_auction_map!inner(af_auction_id)')
      .eq('af_upload_status', 'queued')
      .order('lot_number', { ascending: true })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    if (!lots?.length) return res.json({ message: 'No lots in queue', processed: 0 });

    const results = [];
    for (const lot of lots) {
      // Mark as uploading
      await supabase.from('lots').update({ af_upload_status: 'uploading' }).eq('id', lot.id);

      const photos = (lot.lot_photos || []).map(p => ({
        url: `${SUPABASE_URL}/storage/v1/object/public/lot-photos/${p.storage_path}`,
      }));

      const afAuctionId = lot.af_auction_map?.af_auction_id;
      if (!afAuctionId) {
        await supabase.from('lots').update({
          af_upload_status: 'failed',
          af_upload_error: 'No AF auction linked',
        }).eq('id', lot.id);
        results.push({ lot_id: lot.id, success: false, error: 'No AF auction linked' });
        continue;
      }

      const result = await uploadLot(lot, photos, afAuctionId);

      await supabase.from('lots').update({
        af_upload_status: result.success ? 'uploaded' : 'failed',
        af_upload_error: result.error || null,
      }).eq('id', lot.id);

      results.push({ lot_id: lot.id, lot_number: lot.lot_number, ...result });

      if (result.error?.includes('Session expired')) break;
    }

    res.json({ processed: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Keep-alive: ping AF every 10 minutes to keep session alive
setInterval(async () => {
  if (isLoggedIn) {
    console.log('[keepalive] Pinging AF to maintain session...');
    await checkLogin();
  }
}, 10 * 60 * 1000);

// Poll for queued lots every 30 seconds
setInterval(async () => {
  if (!isLoggedIn) return;

  try {
    const { count } = await supabase
      .from('lots')
      .select('id', { count: 'exact', head: true })
      .eq('af_upload_status', 'queued');

    if (count && count > 0) {
      console.log(`[poll] Found ${count} queued lots, processing...`);
      // Trigger processing
      const response = await fetch(`http://localhost:${PORT}/process-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      console.log(`[poll] Processed:`, data);
    }
  } catch (err) {
    console.error('[poll] Error:', err.message);
  }
}, 30 * 1000);

app.listen(PORT, async () => {
  console.log(`AF Worker running on port ${PORT}`);
  await getBrowser();
  await checkLogin();
  console.log(`Login status: ${isLoggedIn ? 'Logged in' : 'Login required - visit /login'}`);
});
