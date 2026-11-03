// Core BPM estimation. This module is also used by tempo-changes.js.

export function buildOnsetEnvelope(samples, sampleRate, onProgress = () => {}) {
  const frameSize = 2048;
  const hopSize = 512;
  const frameCount = Math.floor((samples.length - frameSize) / hopSize);

  if (frameCount < 20) {
    throw new Error("This audio is too short to analyze.");
  }

  const real = new Float64Array(frameSize);
  const imag = new Float64Array(frameSize);
  const previous = new Float64Array(frameSize / 2);
  const envelope = new Float32Array(frameCount);
  const window = new Float64Array(frameSize);

  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
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
    for (let bin = 2; bin < frameSize / 2; bin++) {
      const magnitude = Math.hypot(real[bin], imag[bin]);
      const difference = magnitude - previous[bin];
      if (difference > 0) flux += difference;
      previous[bin] = magnitude;
    }

    envelope[frame] = flux;
    if (frame % 100 === 0) onProgress(frame / frameCount);
  }

  onProgress(1);

  const smooth = new Float32Array(envelope.length);
  const radius = 8;

  for (let i = 0; i < envelope.length; i++) {
    let mean = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(envelope.length - 1, i + radius); j++) {
      mean += envelope[j];
      count++;
    }
    smooth[i] = Math.max(0, envelope[i] - mean / count);
  }

  let max = 0;
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] > max) max = smooth[i];
  }
  if (max > 0) {
    for (let i = 0; i < smooth.length; i++) smooth[i] /= max;
  }

  return { values: smooth, rate: sampleRate / hopSize };
}

export function estimateBpm(onsets, rate) {
  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.floor((60 / maxBpm) * rate);
  const maxLag = Math.ceil((60 / minBpm) * rate);
  const scores = new Float64Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = onsets.length - lag;
    for (let i = 0; i < limit; i++) sum += onsets[i] * onsets[i + lag];
    scores[lag] = sum / Math.max(1, limit);
  }

  let bestLag = -1;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = scores[lag];
    if (lag * 2 <= maxLag) score += scores[lag * 2] * 0.35;
    if (Math.round(lag / 2) >= minLag) score += scores[Math.round(lag / 2)] * 0.15;
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
  const adjustment = denominator === 0 ? 0 : 0.5 * (left - right) / denominator;
  const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, adjustment));
  const bpm = 60 * rate / refinedLag;

  const localMean = (
    scores[Math.max(minLag, bestLag - 3)] +
    scores[Math.min(maxLag, bestLag + 3)]
  ) / 2;

  return { bpm, confidence: center / Math.max(localMean, 1e-9) };
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
