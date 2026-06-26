const timerNode = document.getElementById('timer');
const endNowBtn = document.getElementById('endNowBtn');
const introVideo = document.getElementById('introVideo');
const loopVideo = document.getElementById('loopVideo');
const fallback = document.getElementById('fallback');
let videosInitialized = false;

function formatMsAsClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function showFallback() {
  introVideo.style.display = 'none';
  loopVideo.style.display = 'none';
  fallback.style.display = 'block';
}

async function initializeVideos() {
  if (videosInitialized) {
    return;
  }
  videosInitialized = true;

  try {
    const introPath = await window.desktopApi.getAssetPath('assets1.webm');
    const loopPath = await window.desktopApi.getAssetPath('assets2.webm');

    introVideo.style.display = 'block';
    loopVideo.style.display = 'none';
    fallback.style.display = 'none';

    introVideo.src = introPath;
    loopVideo.src = loopPath;
    introVideo.preload = 'auto';
    loopVideo.preload = 'auto';
    loopVideo.loop = true;
    introVideo.load();
    loopVideo.load();

    introVideo.addEventListener('ended', () => {
      introVideo.style.display = 'none';
      loopVideo.style.display = 'block';
      loopVideo.play().catch(() => {
        console.error('Failed to play loop video');
        showFallback();
      });
    }, { once: true });

    introVideo.addEventListener('error', (e) => {
      console.error('Intro video error:', e);
      showFallback();
    });

    loopVideo.addEventListener('error', (e) => {
      console.error('Loop video error:', e);
      showFallback();
    });

    await new Promise((resolve, reject) => {
      const onLoaded = () => {
        introVideo.removeEventListener('loadeddata', onLoaded);
        introVideo.removeEventListener('error', onError);
        resolve();
      };
      const onError = (e) => {
        introVideo.removeEventListener('loadeddata', onLoaded);
        introVideo.removeEventListener('error', onError);
        reject(e);
      };
      introVideo.addEventListener('loadeddata', onLoaded, { once: true });
      introVideo.addEventListener('error', onError, { once: true });
    });

    await introVideo.play();
  } catch (error) {
    console.error('Failed to initialize videos:', error);
    showFallback();
  }
}

function render(state) {
  if (!state.isOnBreak || !state.breakEndAt) {
    timerNode.textContent = '00:00';
    return;
  }
  timerNode.textContent = formatMsAsClock(state.breakEndAt - state.now);
}

endNowBtn.addEventListener('click', async () => {
  await window.desktopApi.endBreakNow();
});

window.desktopApi.onStateUpdate((state) => {
  render(state);
});

window.desktopApi.getState().then(render);

initializeVideos();
