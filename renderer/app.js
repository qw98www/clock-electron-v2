const enabledInput = document.getElementById('enabled');
const intervalInput = document.getElementById('intervalMinutes');
const breakInput = document.getElementById('breakMinutes');
const launchAtLoginInput = document.getElementById('launchAtLogin');
const statusText = document.getElementById('statusText');
const nextBreakText = document.getElementById('nextBreakText');
const api = window.desktopApi;

if (!api) {
  statusText.textContent = 'Bridge unavailable';
  nextBreakText.textContent = 'Restart app. If this persists, preload failed to load.';
  document.querySelectorAll('button, input').forEach((el) => {
    el.disabled = true;
  });
  throw new Error('desktopApi is not available in renderer');
}

function formatMsAsClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function render(state) {
  enabledInput.checked = !!state.enabled;
  intervalInput.value = String(state.intervalMinutes);
  breakInput.value = String(state.breakMinutes);
  launchAtLoginInput.checked = !!state.launchAtLogin;

  if (!state.enabled) {
    statusText.textContent = 'Disabled';
    nextBreakText.textContent = '';
    return;
  }

  if (state.isOnBreak && state.breakEndAt) {
    statusText.textContent = 'On Break';
    nextBreakText.textContent = `Break remaining: ${formatMsAsClock(state.breakEndAt - state.now)}`;
    return;
  }

  if (state.isRunning && state.nextBreakAt) {
    statusText.textContent = 'Running';
    nextBreakText.textContent = `Next break in: ${formatMsAsClock(state.nextBreakAt - state.now)}`;
    return;
  }

  statusText.textContent = 'Paused';
  nextBreakText.textContent = '';
}

async function refresh() {
  const state = await api.getState();
  render(state);
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  await api.saveSettings({
    enabled: enabledInput.checked,
    intervalMinutes: Number.parseInt(intervalInput.value, 10),
    breakMinutes: Number.parseInt(breakInput.value, 10),
    launchAtLogin: launchAtLoginInput.checked,
  });
  await refresh();
});

document.getElementById('startBtn').addEventListener('click', async () => {
  await api.startTimer();
  await refresh();
});

document.getElementById('pauseBtn').addEventListener('click', async () => {
  await api.pauseTimer();
  await refresh();
});

document.getElementById('skipBtn').addEventListener('click', async () => {
  await api.skipTimer();
  await refresh();
});

api.onStateUpdate((state) => {
  render(state);
});

refresh().catch((err) => {
  console.error('Failed to refresh initial state:', err);
  statusText.textContent = 'Error loading state';
});
