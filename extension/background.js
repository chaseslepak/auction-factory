// Orchestrates the assisted-posting run. Always works from the live "approved"
// set on the server: posting an item marks it posted (so it leaves the set),
// which makes the run resilient to service-worker restarts.

const CREATE_URL = 'https://www.facebook.com/marketplace/create/item';

const state = {
  running: false,
  currentTitle: '',
  currentId: '',
  total: 0,
  index: 0,
  lastMessage: '',
  tabId: null,
};

let pendingPayload = null;

async function saveState() {
  await chrome.storage.session.set({ runState: state });
}
async function restoreState() {
  const { runState } = await chrome.storage.session.get('runState');
  if (runState) Object.assign(state, runState);
}
restoreState();

async function cfg() {
  const { apiBase, token } = await chrome.storage.local.get(['apiBase', 'token']);
  return { apiBase: (apiBase || '').replace(/\/$/, ''), token };
}

async function fetchApproved() {
  const { apiBase, token } = await cfg();
  if (!apiBase || !token) throw new Error('Not connected');
  const res = await fetch(`${apiBase}/api/marketplace/export?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Fetch failed');
  return data.listings || [];
}

async function markPosted(id) {
  const { apiBase, token } = await cfg();
  await fetch(`${apiBase}/api/marketplace/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, id }),
  }).catch(() => {});
}

async function toDataUrl(url) {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:image/jpeg;base64,' + btoa(bin);
}

async function ensureTab() {
  if (state.tabId != null) {
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (tab) return tab;
    } catch {}
  }
  const tab = await chrome.tabs.create({ url: CREATE_URL, active: true });
  state.tabId = tab.id;
  return tab;
}

async function processNext() {
  if (!state.running) return;
  let listings;
  try {
    listings = await fetchApproved();
  } catch (e) {
    state.running = false;
    state.lastMessage = `Error: ${e.message}`;
    return saveState();
  }

  if (listings.length === 0) {
    state.running = false;
    state.currentTitle = '';
    state.lastMessage = `Done — posted ${state.index} listing${state.index !== 1 ? 's' : ''}.`;
    return saveState();
  }

  const listing = listings[0];
  state.currentTitle = listing.title || listing.handle;
  state.currentId = listing.id;
  await saveState();

  let photos = [];
  try {
    photos = await Promise.all((listing.photos || []).map(toDataUrl));
  } catch {}

  const tab = await ensureTab();
  pendingPayload = {
    type: 'fill',
    listing: {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      category: listing.category,
      condition: listing.condition,
      description: listing.description,
      keywords: listing.keywords || [],
    },
    photos,
  };
  chrome.tabs.update(tab.id, { url: CREATE_URL, active: true });
}

// Send the fill payload once the create page has finished loading.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (
    tabId === state.tabId &&
    info.status === 'complete' &&
    tab.url &&
    tab.url.includes('/marketplace/create') &&
    pendingPayload
  ) {
    const payload = pendingPayload;
    pendingPayload = null;
    setTimeout(() => chrome.tabs.sendMessage(tabId, payload).catch(() => {}), 1500);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'getState') {
      sendResponse(state);
      return;
    }
    if (msg.type === 'connect') {
      try {
        const listings = await fetchApproved();
        sendResponse({ count: listings.length });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      return;
    }
    if (msg.type === 'start') {
      state.running = true;
      state.index = 0;
      state.lastMessage = '';
      try {
        state.total = (await fetchApproved()).length;
      } catch {}
      await saveState();
      processNext();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'stop') {
      state.running = false;
      state.lastMessage = 'Stopped.';
      pendingPayload = null;
      await chrome.alarms.clear('nextItem');
      await saveState();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'userPublished') {
      if (msg.id) await markPosted(msg.id);
      state.index += 1;
      state.currentTitle = 'Pausing before next item…';
      await saveState();
      // Use an alarm (survives SW suspension) for the natural delay.
      const delayMin = 0.5 + Math.random(); // 30–90s
      await chrome.alarms.create('nextItem', { delayInMinutes: delayMin });
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'nextItem') processNext();
});
