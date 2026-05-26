// Runs on facebook.com/marketplace/create/*. Fills the form from a listing
// payload, then shows a branded overlay so the user reviews and clicks
// Facebook's own Publish button. Facebook's DOM changes often — all the
// brittle matching lives in SELECTORS / finder helpers below for easy updates.

(() => {
  if (window.__cgbPosterLoaded) return;
  window.__cgbPosterLoaded = true;

  const SELECTORS = {
    fileInput: 'input[type="file"]',
    // Candidate label texts (matched against aria-label / placeholder / <label>).
    title: ['title'],
    price: ['price'],
    description: ['description'],
    condition: ['condition'],
    category: ['category'],
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 8000, step = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function labelOf(el) {
    const aria = el.getAttribute('aria-label') || '';
    const ph = el.getAttribute('placeholder') || '';
    let lbl = '';
    if (el.id) {
      const l = document.querySelector(`label[for="${el.id}"]`);
      if (l) lbl = l.textContent || '';
    }
    return `${aria} ${ph} ${lbl}`.toLowerCase();
  }

  function findField(candidates) {
    const fields = Array.from(
      document.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea')
    );
    for (const c of candidates) {
      const hit = fields.find((el) => labelOf(el).includes(c));
      if (hit) return hit;
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillText(candidates, value) {
    if (value == null || value === '') return false;
    const el = await waitFor(() => findField(candidates), 6000);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    el.blur();
    return true;
  }

  async function dataUrlToFile(dataUrl, name) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], name, { type: 'image/jpeg' });
  }

  async function setPhotos(photos) {
    if (!photos || photos.length === 0) return false;
    const input = await waitFor(() => document.querySelector(SELECTORS.fileInput), 8000);
    if (!input) return false;
    const files = await Promise.all(
      photos.map((d, i) => dataUrlToFile(d, `photo_${i}.jpg`))
    );
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Best-effort combobox selection (Condition/Category). Facebook renders these
  // as popup listboxes; if anything looks off we leave it for the user.
  async function pickCombo(candidates, valueText) {
    if (!valueText) return false;
    try {
      const combos = Array.from(
        document.querySelectorAll('[role="combobox"], [role="button"], label')
      );
      const trigger = combos.find((el) =>
        candidates.some((c) => (el.getAttribute('aria-label') || el.textContent || '').toLowerCase().includes(c))
      );
      if (!trigger) return false;
      trigger.click();
      const option = await waitFor(() => {
        const opts = Array.from(document.querySelectorAll('[role="option"]'));
        return opts.find((o) => (o.textContent || '').toLowerCase().includes(valueText.toLowerCase()));
      }, 3000);
      if (option) {
        option.click();
        return true;
      }
    } catch {}
    return false;
  }

  function overlay(listing, report) {
    document.getElementById('cgb-overlay')?.remove();
    const box = document.createElement('div');
    box.id = 'cgb-overlay';
    box.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483647;width:320px;' +
      'background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.25);' +
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;overflow:hidden;';
    const kw = (listing.keywords || []).join(', ');
    box.innerHTML = `
      <div style="background:linear-gradient(135deg,#ff5a1f,#ffb020);padding:10px 14px;color:#fff;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Crazy Good Buy · Review &amp; Publish</div>
      <div style="padding:12px 14px;color:#15141f;font-size:13px;">
        <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(listing.title || '')}</div>
        <div style="font-size:12px;color:#555;white-space:pre-line;margin-bottom:8px;">${report}</div>
        ${kw ? `<div style="font-size:11px;color:#777;margin-bottom:8px;">Suggested tags: ${escapeHtml(kw)} <button id="cgb-copy" style="border:none;background:#ece7e0;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:11px;">copy</button></div>` : ''}
        <div style="font-size:12px;color:#444;margin-bottom:10px;">Check Category &amp; Condition, then click Facebook's <b>Publish</b>. Once it's live, click below.</div>
        <button id="cgb-next" style="width:100%;border:none;border-radius:999px;padding:10px;background:linear-gradient(135deg,#ff5a1f,#ffb020);color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;">Posted ✓ — Next</button>
      </div>`;
    document.body.appendChild(box);
    box.querySelector('#cgb-copy')?.addEventListener('click', () => navigator.clipboard.writeText(kw));
    box.querySelector('#cgb-next').addEventListener('click', () => {
      box.remove();
      chrome.runtime.sendMessage({ type: 'userPublished', id: listing.id });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function fill(listing, photos) {
    const done = [];
    if (await setPhotos(photos)) done.push(`✓ ${photos.length} photo(s)`);
    else done.push('• Add photos manually');
    if (await fillText(SELECTORS.title, listing.title)) done.push('✓ Title');
    if (await fillText(SELECTORS.price, listing.price)) done.push('✓ Price');
    if (await fillText(SELECTORS.description, listing.description)) done.push('✓ Description');
    if (await pickCombo(SELECTORS.condition, listing.condition)) done.push('✓ Condition');
    else if (listing.condition) done.push(`• Condition: ${listing.condition}`);
    if (listing.category) done.push(`• Category: ${listing.category}`);
    overlay(listing, done.join('\n'));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'fill') fill(msg.listing, msg.photos);
  });
})();
