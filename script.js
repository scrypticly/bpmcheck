
(() => {
  const fileInput = document.getElementById("audioFile");
  const dropZone = document.getElementById("dropZone");
  const fileInfo = document.getElementById("fileInfo");
  const fileName = document.getElementById("fileName");
  const fileMeta = document.getElementById("fileMeta");
  const analyzeButton = document.getElementById("analyzeButton");
  const removeFileButton = document.getElementById("removeFile");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const statusText = document.getElementById("statusText");
  const result = document.getElementById("result");
  const bpmValue = document.getElementById("bpmValue");
  const resultNote = document.getElementById("resultNote");
  const retryButton = document.getElementById("retryButton");
  const errorMessage = document.getElementById("errorMessage");

  // Playback elements
  const player = document.getElementById("player");
  const playButton = document.getElementById("playButton");
  const playIcon = document.getElementById("playIcon");
  const seekBar = document.getElementById("seekBar");
  const currentTimeLabel = document.getElementById("currentTime");
  const durationLabel = document.getElementById("duration");

  // Metronome elements
  const metronomeEnabled = document.getElementById("metronomeEnabled");
  const metronomeStatus = document.getElementById("metronomeStatus");
  const metronomeBpm = document.getElementById("metronomeBpm");

  const audioVolume = document.getElementById("audioVolume");
  const audioVolumeValue = document.getElementById("audioVolumeValue");

  const metronomeVolume = document.getElementById("metronomeVolume");
  const metronomeVolumeValue = document.getElementById("metronomeVolumeValue");

  const bpmSwitchesEnabled = document.getElementById("bpmSwitchesEnabled");
  const bpmChanges = document.getElementById("bpmChanges");
  const bpmTableBody = document.getElementById("bpmTableBody");
  const bpmMarkers = document.getElementById("bpmMarkers");
  
  let selectedFile = null;
  let isAnalyzing = false;
  let bpmSegments = [];

  // Playback state
  const audio = new Audio();
  audio.preload = "metadata";

  audio.volume = 0.7;

  audioVolume.addEventListener("input", () => {
    audio.volume = Number(audioVolume.value) / 100;
    audioVolumeValue.textContent = `${audioVolume.value}%`;
  });

  metronomeVolume.addEventListener("input", () => {
    metronomeVolumeValue.textContent = `${metronomeVolume.value}%`;
  });
  
  let audioURL = null;
  let audioContext = null;
  let metronomeTimer = null;
  let nextBeatIndex = 0;
  let nextBeatTime = 0;

  const METRONOME_LOOKAHEAD = 0.12;
  const METRONOME_INTERVAL = 25;

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function getBpm() {
    const bpm = Number(bpmValue.textContent);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
  }

  function formatBpmTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 100);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}.${String(milliseconds).padStart(2, "0")}`;
}

function getBpmAtTime(time) {
  if (!bpmSegments.length) return getBpm();

  let activeSegment = bpmSegments[0];

  for (const segment of bpmSegments) {
    if (segment.start > time) break;
    activeSegment = segment;
  }

  return activeSegment.bpm;
}

function renderBpmChanges() {
  bpmTableBody.innerHTML = "";
  bpmMarkers.innerHTML = "";

  if (bpmSegments.length <= 1 || !Number.isFinite(audio.duration)) {
    bpmChanges.hidden = true;
    return;
  }

  bpmChanges.hidden = false;

  bpmSegments.forEach((segment, index) => {
    const row = document.createElement("tr");

    const timeCell = document.createElement("td");
    const bpmCell = document.createElement("td");

    timeCell.textContent = formatBpmTime(segment.start);
    bpmCell.textContent = `${segment.bpm} BPM`;

    row.append(timeCell, bpmCell);
    bpmTableBody.appendChild(row);

    if (index === 0) return;

    const marker = document.createElement("div");
    marker.className = "bpm-marker";
    marker.style.left = `${(segment.start / audio.duration) * 100}%`;
    marker.title = `${segment.bpm} BPM at ${formatTime(segment.start)}`;

    bpmMarkers.appendChild(marker);
  });
}

  function setFile(file) {
    if (!file) return;

    if (!file.type.startsWith("audio/") &&
      !/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(file.name)) {
      showError("Please choose a supported audio file.");
      return;
    }

    clearPlayback();

    selectedFile = file;
    audioURL = URL.createObjectURL(file);
    audio.src = audioURL;

    fileName.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} · Ready to analyze`;

    fileInfo.hidden = false;
    player.hidden = false;
    dropZone.hidden = true;

    playButton.disabled = true;
    seekBar.disabled = true;
    playIcon.textContent = "▶";

    currentTimeLabel.textContent = "0:00";
    durationLabel.textContent = "0:00";
    seekBar.value = 0;

    analyzeButton.disabled = false;
    result.hidden = true;
    progressWrap.hidden = true;
    errorMessage.hidden = true;

    updateMetronomeStatus();
  }

  function reset() {
    clearPlayback();

    selectedFile = null;
    fileInput.value = "";

    fileInfo.hidden = true;
    player.hidden = true;
    dropZone.hidden = false;

    analyzeButton.disabled = true;
    progressWrap.hidden = true;
    result.hidden = true;
    errorMessage.hidden = true;

    bpmValue.textContent = "--";
    metronomeBpm.textContent = "— BPM";

    setProgress(0, "");
  }

  function clearPlayback() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      audioURL = null;
    }

    stopMetronome();

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    playIcon.textContent = "▶";
    currentTimeLabel.textContent = "0:00";
    durationLabel.textContent = "0:00";
    seekBar.value = 0;

    playButton.disabled = true;
    seekBar.disabled = true;

    bpmSegments = [];
    bpmChanges.hidden = true;
    bpmTableBody.innerHTML = "";
    bpmMarkers.innerHTML = "";
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  function setProgress(percent, message) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;
    if (message) statusText.textContent = message;
  }

  // --------------------------------------------------
  // AUDIO PLAYBACK
  // --------------------------------------------------

  audio.addEventListener("loadedmetadata", () => {
    if (!Number.isFinite(audio.duration)) return;

    durationLabel.textContent = formatTime(audio.duration);
    playButton.disabled = false;
    seekBar.disabled = false;
  });

  audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

    seekBar.value = (audio.currentTime / audio.duration) * 1000;
    currentTimeLabel.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("play", () => {
    playIcon.textContent = "❚❚";

    if (metronomeEnabled.checked && getBpm()) {
      startMetronome();
    }
  });

  audio.addEventListener("pause", () => {
    playIcon.textContent = "▶";
    stopMetronome();
  });

  audio.addEventListener("ended", () => {
    playIcon.textContent = "▶";
    stopMetronome();
    seekBar.value = 1000;
    currentTimeLabel.textContent = formatTime(audio.duration);
  });

  playButton.addEventListener("click", async () => {
    if (!audio.src) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.error(error);
      showError("Unable to play this audio file in your browser.");
    }
  });

  // Allow dragging and clicking anywhere on the timeline.
  seekBar.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration)) return;

    const progress = Number(seekBar.value) / 1000;
    audio.currentTime = progress * audio.duration;

    currentTimeLabel.textContent = formatTime(audio.currentTime);

    // Resynchronize the metronome after seeking.
    if (!audio.paused && metronomeEnabled.checked && getBpm()) {
      synchronizeMetronome();
    }
  });

  // --------------------------------------------------
  // METRONOME
  // --------------------------------------------------

  function updateMetronomeStatus() {
    const bpm = getBpm();

    if (!bpm) {
      metronomeBpm.textContent = "— BPM";
      metronomeStatus.textContent = "Turns on after BPM analysis";
      return;
    }

    metronomeBpm.textContent = `${bpm} BPM`;
    metronomeStatus.textContent = metronomeEnabled.checked
      ? "Enabled · Synchronized to playback"
      : "Disabled";
  }

  metronomeEnabled.addEventListener("change", async () => {
    updateMetronomeStatus();

    if (!metronomeEnabled.checked) {
      stopMetronome();
      return;
    }

    if (!audio.paused && getBpm()) {
      startMetronome();
    }
  });

  async function getAudioContext() {
    if (!audioContext || audioContext.state === "closed") {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    return audioContext;
  }

function getTempoSegmentAtTime(time) {
  if (!bpmSegments.length) {
    return { start: 0, bpm: getBpm() };
  }

  let activeSegment = bpmSegments[0];

  for (const segment of bpmSegments) {
    if (segment.start > time) break;
    activeSegment = segment;
  }

  return activeSegment;
}

async function startMetronome() {
  const bpm = getBpm();

  if (!bpm || !metronomeEnabled.checked || audio.paused) return;

  try {
    await getAudioContext();

    if (audio.paused || !metronomeEnabled.checked) return;

    stopMetronome();

    const segment = getTempoSegmentAtTime(audio.currentTime);
    const beatDuration = 60 / segment.bpm;

    nextBeatTime = segment.start +
      Math.ceil((audio.currentTime - segment.start) / beatDuration - 0.00001) *
      beatDuration;

    if (nextBeatTime < audio.currentTime - 0.02) {
      nextBeatTime += beatDuration;
    }

    scheduleMetronome();

    metronomeTimer = setInterval(
      scheduleMetronome,
      METRONOME_INTERVAL
    );
  } catch (error) {
    console.error("Metronome error:", error);
    metronomeStatus.textContent = "Audio unavailable";
  }
}

function scheduleMetronome() {
  if (!audioContext || audio.paused || !metronomeEnabled.checked) {
    stopMetronome();
    return;
  }

  const currentAudioTime = audio.currentTime;
  const lookahead = METRONOME_LOOKAHEAD;

  while (nextBeatTime <= currentAudioTime + lookahead) {
    const segment = getTempoSegmentAtTime(nextBeatTime);
    const beatDuration = 60 / segment.bpm;

    const nextSegment = bpmSegments.find(
      item => item.start > segment.start
    );

    // Don't schedule a beat past the next tempo change.
    if (nextSegment && nextBeatTime >= nextSegment.start) {
      nextBeatTime = nextSegment.start;
      continue;
    }

    if (nextBeatTime >= currentAudioTime - 0.02) {
      const delay = Math.max(
        0,
        (nextBeatTime - currentAudioTime) / audio.playbackRate
      );

      playMetronomeClick(audioContext.currentTime + delay);
    }

    if (
      nextSegment &&
      nextBeatTime + beatDuration >= nextSegment.start
    ) {
      nextBeatTime = nextSegment.start;
    } else {
      nextBeatTime += beatDuration;
    }
  }
}

  function playMetronomeClick(time) {
    if (!audioContext) return;

    const volume = Number(metronomeVolume.value) / 100;
    if (volume <= 0) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1000, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.22 * volume, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  
    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(time);
    oscillator.stop(time + 0.05);

    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  function stopMetronome() {
    if (metronomeTimer !== null) {
      clearInterval(metronomeTimer);
      metronomeTimer = null;
    }
  }

  function synchronizeMetronome() {
    startMetronome();
  }

  // --------------------------------------------------
  // FILE EVENTS
  // --------------------------------------------------

  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
  removeFileButton.addEventListener("click", reset);
  retryButton.addEventListener("click", reset);

  ["dragenter", "dragover"].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });

  dropZone.addEventListener("drop", event => {
    setFile(event.dataTransfer.files[0]);
  });

  analyzeButton.addEventListener("click", analyzeSelectedFile);

  // --------------------------------------------------
  // BPM ANALYSIS
  // --------------------------------------------------

  async function analyzeSelectedFile() {
    if (!selectedFile || isAnalyzing) return;

    isAnalyzing = true;
    analyzeButton.disabled = true;
    result.hidden = true;
    errorMessage.hidden = true;
    progressWrap.hidden = false;

    setProgress(3, "Loading audio…");

    let analysisContext;

    try {
      const buffer = await selectedFile.arrayBuffer();

      setProgress(12, "Decoding audio…");

      analysisContext = new (
        window.AudioContext || window.webkitAudioContext
      )();

      const audioBuffer = await analysisContext.decodeAudioData(
        buffer.slice(0)
      );

      setProgress(30, "Detecting rhythmic patterns…");

      const mono = mixToMono(audioBuffer);

      const onsets = buildOnsetEnvelope(
        mono,
        audioBuffer.sampleRate,
        percent => {
          setProgress(
            30 + percent * 0.55,
            "Detecting rhythmic patterns…"
          );
        }
      );

      setProgress(90, "Estimating tempo…");

      let estimate;

if (bpmSwitchesEnabled.checked) {
  setProgress(92, "Checking for tempo changes…");

  bpmSegments = detectBpmChanges(onsets.values, onsets.rate);

  if (!bpmSegments || bpmSegments.length === 0) {
    throw new Error("We couldn't reliably detect the tempo of this song.");
  }

  estimate = {
    bpm: bpmSegments[0].bpm,
    confidence: 1
  };
} else {
  bpmSegments = [];

  estimate = estimateBpm(onsets.values, onsets.rate);

  if (!estimate || !Number.isFinite(estimate.bpm)) {
    throw new Error(
      "We couldn't find a steady beat in this audio. Try a clearer section or another file."
    );
  }

  bpmSegments = [{
    start: 0,
    bpm: Math.round(estimate.bpm)
  }];
}

setProgress(100, "Analysis complete");

bpmValue.textContent = String(Math.round(estimate.bpm));

if (bpmSwitchesEnabled.checked) {
  resultNote.textContent = bpmSegments.length > 1
    ? `Detected ${bpmSegments.length} tempo sections throughout the song.`
    : "No clear tempo changes detected. The song appears to have a steady tempo.";
} else {
  resultNote.textContent = estimate.confidence < 1.15
    ? "Estimated tempo — this track may have a loose or changing beat."
    : "Estimated tempo detected from the audio.";
}

renderBpmChanges();
result.hidden = false;

updateMetronomeStatus();

if (!audio.paused && metronomeEnabled.checked) {
  startMetronome();
}
      if (!estimate || !Number.isFinite(estimate.bpm)) {
        throw new Error(
          "We couldn't find a steady beat in this audio. Try a clearer section or another file."
        );
      }

      setProgress(100, "Analysis complete");

      bpmValue.textContent = String(Math.round(estimate.bpm));

      resultNote.textContent = estimate.confidence < 1.15
        ? "Estimated tempo — this track may have a loose or changing beat."
        : "Estimated tempo detected from the audio.";

      result.hidden = false;

      updateMetronomeStatus();

      // If playback is already running, activate the metronome.
      if (!audio.paused && metronomeEnabled.checked) {
        startMetronome();
      }

    } catch (error) {
      console.error(error);
      showError(
        error.message || "Something went wrong while analyzing this file."
      );
    } finally {
      if (analysisContext && analysisContext.state !== "closed") {
        try {
          await analysisContext.close();
        } catch (_) {}
      }

      isAnalyzing = false;
      analyzeButton.disabled = !selectedFile;

      if (result.hidden && !errorMessage.hidden) {
        progressWrap.hidden = true;
      }
    }
  }

  // --------------------------------------------------
  // AUDIO PROCESSING
  // --------------------------------------------------

  function mixToMono(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);

    for (let channel = 0; channel < channels; channel++) {
      const data = audioBuffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        mono[i] += data[i] / channels;
      }
    }

    return mono;
  }

  function buildOnsetEnvelope(samples, sampleRate, onProgress) {
    const frameSize = 2048;
    const hopSize = 512;

    const frameCount = Math.max(
      0,
      Math.floor((samples.length - frameSize) / hopSize)
    );

    if (frameCount < 20) {
      throw new Error("This audio is too short to analyze.");
    }

    const fftSize = frameSize;
    const real = new Float64Array(fftSize);
    const imag = new Float64Array(fftSize);
    const previous = new Float64Array(fftSize / 2);
    const envelope = new Float32Array(frameCount);
    const window = new Float64Array(frameSize);

    for (let i = 0; i < frameSize; i++) {
      window[i] = 0.5 - 0.5 * Math.cos(
        (2 * Math.PI * i) / (frameSize - 1)
      );
    }

    for (let frame = 0; frame < frameCount; frame++) {
      const offset = frame * hopSize;

      real.fill(0);
      imag.fill(0);

      for (let i = 0; i < frameSize; i++) {
        real[i] = samples[offset + i] * window[i];
      }

      fft(real, imag);

      let flux = 0;

      for (let bin = 2; bin < fftSize / 2; bin++) {
        const magnitude = Math.hypot(real[bin], imag[bin]);
        const difference = magnitude - previous[bin];

        if (difference > 0) flux += difference;

        previous[bin] = magnitude;
      }

      envelope[frame] = flux;

      if (frame % 100 === 0) {
        onProgress(frame / frameCount);
      }
    }

    onProgress(1);

    const smooth = new Float32Array(envelope.length);
    const radius = 8;

    for (let i = 0; i < envelope.length; i++) {
      let mean = 0;
      let count = 0;

      for (
        let j = Math.max(0, i - radius);
        j <= Math.min(envelope.length - 1, i + radius);
        j++
      ) {
        mean += envelope[j];
        count++;
      }

      smooth[i] = Math.max(0, envelope[i] - mean / count);
    }

    const max = Math.max(...smooth);

    if (max > 0) {
      for (let i = 0; i < smooth.length; i++) {
        smooth[i] /= max;
      }
    }

    return {
      values: smooth,
      rate: sampleRate / hopSize
    };
  }

  // In-place radix-2 Cooley-Tukey FFT.
  function fft(real, imag) {
    const n = real.length;

    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;

      for (; j & bit; bit >>= 1) {
        j ^= bit;
      }

      j ^= bit;

      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const angle = -2 * Math.PI / size;
      const stepReal = Math.cos(angle);
      const stepImag = Math.sin(angle);

      for (let start = 0; start < n; start += size) {
        let wr = 1;
        let wi = 0;

        for (let j = 0; j < half; j++) {
          const even = start + j;
          const odd = even + half;

          const tr = wr * real[odd] - wi * imag[odd];
          const ti = wr * imag[odd] + wi * real[odd];

          real[odd] = real[even] - tr;
          imag[odd] = imag[even] - ti;

          real[even] += tr;
          imag[even] += ti;

          const nextWr = wr * stepReal - wi * stepImag;

          wi = wr * stepImag + wi * stepReal;
          wr = nextWr;
        }
      }
    }
  }

  function estimateBpm(onsets, rate) {
    const minBpm = 60;
    const maxBpm = 200;

    const minLag = Math.floor((60 / maxBpm) * rate);
    const maxLag = Math.ceil((60 / minBpm) * rate);

    const scores = new Float64Array(maxLag + 1);

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      const limit = onsets.length - lag;

      for (let i = 0; i < limit; i++) {
        sum += onsets[i] * onsets[i + lag];
      }

      scores[lag] = sum / Math.max(1, limit);
    }

    let bestLag = -1;
    let bestScore = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = scores[lag];

      if (lag * 2 <= maxLag) {
        score += scores[lag * 2] * 0.35;
      }

      if (Math.round(lag / 2) >= minLag) {
        score += scores[Math.round(lag / 2)] * 0.15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    if (bestLag < 0 || bestScore <= 0) return null;

    const left = scores[bestLag - 1] || 0;
    const center = scores[bestLag];
    const right = scores[bestLag + 1] || 0;

    const denominator = left - 2 * center + right;

    const adjustment = denominator === 0
      ? 0
      : 0.5 * (left - right) / denominator;

    const refinedLag = bestLag + Math.max(
      -0.5,
      Math.min(0.5, adjustment)
    );

    const bpm = 60 * rate / refinedLag;

    const localMean = (
      scores[Math.max(minLag, bestLag - 3)] +
      scores[Math.min(maxLag, bestLag + 3)]
    ) / 2;

    const confidence = center / Math.max(localMean, 1e-9);

    return { bpm, confidence };
  }
})();

function detectBpmChanges(onsets, rate) {
  const windowSeconds = 10;
  const stepSeconds = 2;

  const windowSize = Math.floor(windowSeconds * rate);
  const stepSize = Math.floor(stepSeconds * rate);

  if (onsets.length < windowSize) {
    const estimate = estimateBpm(onsets, rate);

    return estimate
      ? [{ start: 0, bpm: Math.round(estimate.bpm) }]
      : null;
  }

  const windows = [];

  for (let start = 0; start + windowSize <= onsets.length; start += stepSize) {
    const section = onsets.subarray(start, start + windowSize);
    const estimate = estimateBpm(section, rate);

    if (!estimate || estimate.confidence < 1.05) continue;

    windows.push({
      start: start / rate,
      bpm: estimate.bpm
    });
  }

  if (windows.length === 0) return null;

  // Smooth estimates using the median of neighboring windows.
  const smoothed = windows.map((window, index) => {
    const nearby = windows
      .slice(Math.max(0, index - 1), Math.min(windows.length, index + 2))
      .map(item => item.bpm)
      .sort((a, b) => a - b);

    return {
      start: window.start,
      bpm: nearby[Math.floor(nearby.length / 2)]
    };
  });

  const segments = [{
    start: 0,
    bpm: Math.round(smoothed[0].bpm)
  }];

  let currentBpm = smoothed[0].bpm;

  // Require three consecutive windows to agree on a new tempo.
  for (let i = 1; i <= smoothed.length - 3; i++) {
    const candidate = smoothed[i].bpm;
    const next = smoothed[i + 1].bpm;
    const following = smoothed[i + 2].bpm;

    const difference = Math.abs(candidate - currentBpm);
    const minimumDifference = Math.max(3, currentBpm * 0.035);

    const candidateIsStable =
      Math.abs(candidate - next) <= candidate * 0.04 &&
      Math.abs(candidate - following) <= candidate * 0.04;

    if (
      difference >= minimumDifference &&
      candidateIsStable
    ) {
      currentBpm = (candidate + next + following) / 3;

      segments.push({
        start: smoothed[i].start,
        bpm: Math.round(currentBpm)
      });

      // Skip the windows already used to confirm this change.
      i += 2;
    }
  }

  return segments;
}
