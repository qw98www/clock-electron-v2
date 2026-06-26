const enabledInput = document.getElementById('enabled');
const intervalMinutesInput = document.getElementById('intervalMinutes');
const intervalSecondsInput = document.getElementById('intervalSeconds');
const breakMinutesInput = document.getElementById('breakMinutes');
const breakSecondsInput = document.getElementById('breakSeconds');
const launchAtLoginInput = document.getElementById('launchAtLogin');
const statusText = document.getElementById('statusText');
const nextBreakText = document.getElementById('nextBreakText');
const api = window.desktopApi;

function splitSecs(secs) {
  const safeSecs = Number.isFinite(secs) && secs > 0 ? secs : 0;
  return {
    minutes: Math.floor(safeSecs / 60),
    seconds: safeSecs % 60,
  };
}

function readDurationSecs(minutesInput, secondsInput) {
  const minutes = Number.parseInt(minutesInput.value, 10);
  const seconds = Number.parseInt(secondsInput.value, 10);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 59) : 0;
  return safeMinutes * 60 + safeSeconds;
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
  const intervalParts = splitSecs(state.intervalSecs);
  const breakParts = splitSecs(state.breakSecs);
  intervalMinutesInput.value = String(intervalParts.minutes);
  intervalSecondsInput.value = String(intervalParts.seconds);
  breakMinutesInput.value = String(breakParts.minutes);
  breakSecondsInput.value = String(breakParts.seconds);
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

document.getElementById('saveBtn').addEventListener('click', async () => {
  await api.saveSettings({
    enabled: enabledInput.checked,
    intervalSecs: readDurationSecs(intervalMinutesInput, intervalSecondsInput),
    breakSecs: readDurationSecs(breakMinutesInput, breakSecondsInput),
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
