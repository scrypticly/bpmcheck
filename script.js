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

  let selectedFile = null;
  let isAnalyzing = false;

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setFile(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(file.name)) {
      showError("Please choose a supported audio file.");
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} · Ready to analyze`;
    fileInfo.hidden = false;
    dropZone.hidden = true;
    analyzeButton.disabled = false;
    result.hidden = true;
    progressWrap.hidden = true;
    errorMessage.hidden = true;
  }

  function reset() {
    selectedFile = null;
    fileInput.value = "";
    fileInfo.hidden = true;
    dropZone.hidden = false;
    analyzeButton.disabled = true;
    progressWrap.hidden = true;
    result.hidden = true;
    errorMessage.hidden = true;
    setProgress(0, "");
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
  dropZone.addEventListener("drop", event => setFile(event.dataTransfer.files[0]));

  analyzeButton.addEventListener("click", analyzeSelectedFile);

  async function analyzeSelectedFile() {
    if (!selectedFile || isAnalyzing) return;
    isAnalyzing = true;
    analyzeButton.disabled = true;
    result.hidden = true;
    errorMessage.hidden = true;
    progressWrap.hidden = false;
    setProgress(3, "Loading audio…");

    let audioContext;
    try {
      const buffer = await selectedFile.arrayBuffer();
      setProgress(12, "Decoding audio…");
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
      setProgress(30, "Detecting rhythmic patterns…");

      // Work with a mono signal. Sampling a subset of channels is sufficient
      // for tempo estimation and keeps memory use lower.
      const mono = mixToMono(audioBuffer);
      const onsets = buildOnsetEnvelope(mono, audioBuffer.sampleRate, percent => {
        setProgress(30 + percent * 0.55, "Detecting rhythmic patterns…");
      });

      setProgress(90, "Estimating tempo…");
      const estimate = estimateBpm(onsets.values, onsets.rate);

      if (!estimate || !Number.isFinite(estimate.bpm)) {
        throw new Error("We couldn't find a steady beat in this audio. Try a clearer section or another file.");
      }

      setProgress(100, "Analysis complete");
      bpmValue.textContent = String(Math.round(estimate.bpm));
      resultNote.textContent = estimate.confidence < 1.15
        ? "Estimated tempo — this track may have a loose or changing beat."
        : "Estimated tempo detected from the audio.";
      result.hidden = false;
    } catch (error) {
      console.error(error);
      showError(error.message || "Something went wrong while analyzing this file.");
    } finally {
      if (audioContext && audioContext.state !== "closed") {
        try { await audioContext.close(); } catch (_) {}
      }
      isAnalyzing = false;
      analyzeButton.disabled = !selectedFile;
      if (result.hidden && !errorMessage.hidden) progressWrap.hidden = true;
    }
  }

  function mixToMono(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < channels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
    }
    return mono;
  }

  // Spectral-flux onset detection: each frame is compared with the previous
  // frame, emphasizing newly appearing energy rather than sustained notes.
  function buildOnsetEnvelope(samples, sampleRate, onProgress) {
    const frameSize = 2048;
    const hopSize = 512;
    const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hopSize));
    if (frameCount < 20) throw new Error("This audio is too short to analyze.");

    const fftSize = frameSize;
    const real = new Float64Array(fftSize);
    const imag = new Float64Array(fftSize);
    const previous = new Float64Array(fftSize / 2);
    const envelope = new Float32Array(frameCount);
    const window = new Float64Array(frameSize);

    for (let i = 0; i < frameSize; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
    }

    for (let frame = 0; frame < frameCount; frame++) {
      const offset = frame * hopSize;
      real.fill(0);
      imag.fill(0);
      for (let i = 0; i < frameSize; i++) real[i] = samples[offset + i] * window[i];

      fft(real, imag);
      let flux = 0;
      for (let bin = 2; bin < fftSize / 2; bin++) {
        const magnitude = Math.hypot(real[bin], imag[bin]);
        const difference = magnitude - previous[bin];
        if (difference > 0) flux += difference;
        previous[bin] = magnitude;
      }
      envelope[frame] = flux;
      if (frame % 100 === 0) onProgress(frame / frameCount);
    }
    onProgress(1);

    // Remove the slow baseline and normalize the onset curve.
    const smooth = new Float32Array(envelope.length);
    const radius = 8;
    for (let i = 0; i < envelope.length; i++) {
      let mean = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(envelope.length - 1, i + radius); j++) {
        mean += envelope[j]; count++;
      }
      smooth[i] = Math.max(0, envelope[i] - mean / count);
    }
    const max = Math.max(...smooth);
    if (max > 0) for (let i = 0; i < smooth.length; i++) smooth[i] /= max;

    return { values: smooth, rate: sampleRate / hopSize };
  }

  // In-place radix-2 Cooley-Tukey FFT.
  function fft(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
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
        let wr = 1, wi = 0;
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

    // Autocorrelation of the onset envelope.
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      const limit = onsets.length - lag;
      for (let i = 0; i < limit; i++) sum += onsets[i] * onsets[i + lag];
      scores[lag] = sum / Math.max(1, limit);
    }

    // Favor a tempo whose half/double-time alternatives also have support,
    // while retaining the strongest periodicity as the main signal.
    let bestLag = -1;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = scores[lag];
      if (lag * 2 <= maxLag) score += scores[lag * 2] * 0.35;
      if (Math.round(lag / 2) >= minLag) score += scores[Math.round(lag / 2)] * 0.15;
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }

    if (bestLag < 0 || bestScore <= 0) return null;

    // Parabolic interpolation around the peak for a more precise estimate.
    const left = scores[bestLag - 1] || 0;
    const center = scores[bestLag];
    const right = scores[bestLag + 1] || 0;
    const denominator = left - 2 * center + right;
    const adjustment = denominator === 0 ? 0 : 0.5 * (left - right) / denominator;
    const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, adjustment));
    const bpm = 60 * rate / refinedLag;

    const localMean = (scores[Math.max(minLag, bestLag - 3)] +
      scores[Math.min(maxLag, bestLag + 3)]) / 2;
    const confidence = center / Math.max(localMean, 1e-9);
    return { bpm, confidence };
  }
})();
