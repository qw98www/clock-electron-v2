const enabledInput = document.getElementById('enabled');
const intervalValueInput = document.getElementById('intervalValue');
const intervalUnitSelect = document.getElementById('intervalUnit');
const breakValueInput = document.getElementById('breakValue');
const breakUnitSelect = document.getElementById('breakUnit');
const launchAtLoginInput = document.getElementById('launchAtLogin');
const statusText = document.getElementById('statusText');
const nextBreakText = document.getElementById('nextBreakText');
const api = window.desktopApi;

// Convert seconds to the display value given the chosen unit
function secsToDisplay(secs, unit) {
  return unit === 'min' ? Math.round(secs / 60) : secs;
}

// Convert display value + unit back to seconds
function displayToSecs(val, unit) {
  const n = Number.parseInt(val, 10);
  return unit === 'min' ? n * 60 : n;
}

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
  // Only update the numeric value, preserve the user's chosen unit
  intervalValueInput.value = secsToDisplay(state.intervalSecs, intervalUnitSelect.value);
  breakValueInput.value = secsToDisplay(state.breakSecs, breakUnitSelect.value);
  launchAtLoginInput.checked = !!state.launchAtLogin;

  if (!state.enabled) {
    statusText.textContent = 'Disabled';
    nextBreakText.textContent = '';
    return;
  }

  if (state.isOnBreak) {
    statusText.textContent = 'On Break';
    nextBreakText.textContent = '';
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

// When user switches unit, convert the displayed value to keep the same duration
intervalUnitSelect.addEventListener('change', () => {
  const currentSecs = displayToSecs(intervalValueInput.value, intervalUnitSelect.value === 'min' ? 'sec' : 'min');
  intervalValueInput.value = secsToDisplay(currentSecs, intervalUnitSelect.value);
});

breakUnitSelect.addEventListener('change', () => {
  const currentSecs = displayToSecs(breakValueInput.value, breakUnitSelect.value === 'min' ? 'sec' : 'min');
  breakValueInput.value = secsToDisplay(currentSecs, breakUnitSelect.value);
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  await api.saveSettings({
    enabled: enabledInput.checked,
    intervalSecs: displayToSecs(intervalValueInput.value, intervalUnitSelect.value),
    breakSecs: displayToSecs(breakValueInput.value, breakUnitSelect.value),
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
