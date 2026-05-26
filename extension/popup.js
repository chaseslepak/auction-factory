const $ = (id) => document.getElementById(id);

async function load() {
  const { apiBase, token } = await chrome.storage.local.get(['apiBase', 'token']);
  if (apiBase) $('apiBase').value = apiBase;
  if (token) $('token').value = token;
  refreshState();
}

function setStatus(msg) {
  $('status').textContent = msg || '';
}

async function refreshState() {
  const state = await chrome.runtime.sendMessage({ type: 'getState' });
  if (!state) return;
  const running = state.running;
  $('start').hidden = running;
  $('stop').hidden = !running;
  if (running) {
    setStatus(`Posting ${state.index + 1} of ${state.total}: ${state.currentTitle || ''}`);
  } else if (state.lastMessage) {
    setStatus(state.lastMessage);
  }
}

$('connect').addEventListener('click', async () => {
  const apiBase = $('apiBase').value.trim().replace(/\/$/, '');
  const token = $('token').value.trim();
  if (!apiBase || !token) {
    setStatus('Enter the app URL and a token.');
    return;
  }
  await chrome.storage.local.set({ apiBase, token });
  setStatus('Connecting…');
  const res = await chrome.runtime.sendMessage({ type: 'connect' });
  if (res?.error) {
    setStatus(`Error: ${res.error}`);
    $('start').disabled = true;
  } else {
    setStatus(`Connected. ${res.count} approved listing${res.count !== 1 ? 's' : ''} ready.`);
    $('start').disabled = res.count === 0;
  }
});

$('start').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'start' });
  refreshState();
});

$('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stop' });
  refreshState();
});

setInterval(refreshState, 1500);
load();
