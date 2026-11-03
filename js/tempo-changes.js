// Sliding-window BPM change detection.

import { estimateBpm } from "./bpm.js";

export function detectBpmChanges(onsets, rate) {
  const windowSeconds = 10;
  const stepSeconds = 2;
  const windowSize = Math.floor(windowSeconds * rate);
  const stepSize = Math.floor(stepSeconds * rate);

  if (onsets.length < windowSize) {
    const estimate = estimateBpm(onsets, rate);
    return estimate ? [{ start: 0, bpm: Math.round(estimate.bpm) }] : null;
  }

  const windows = [];

  for (let start = 0; start + windowSize <= onsets.length; start += stepSize) {
    const estimate = estimateBpm(onsets.subarray(start, start + windowSize), rate);
    if (!estimate || estimate.confidence < 1.05) continue;
    windows.push({ start: start / rate, bpm: estimate.bpm });
  }

  if (!windows.length) return null;

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

  const segments = [{ start: 0, bpm: Math.round(smoothed[0].bpm) }];
  let currentBpm = smoothed[0].bpm;

  // Require three neighboring windows to agree before accepting a tempo change.
  for (let i = 1; i <= smoothed.length - 3; i++) {
    const candidate = smoothed[i].bpm;
    const next = smoothed[i + 1].bpm;
    const following = smoothed[i + 2].bpm;
    const difference = Math.abs(candidate - currentBpm);
    const minimumDifference = Math.max(3, currentBpm * 0.035);

    const stable =
      Math.abs(candidate - next) <= candidate * 0.04 &&
      Math.abs(candidate - following) <= candidate * 0.04;

    if (difference >= minimumDifference && stable) {
      currentBpm = (candidate + next + following) / 3;
      segments.push({ start: smoothed[i].start, bpm: Math.round(currentBpm) });
      i += 2;
    }
  }

  return segments;
}
