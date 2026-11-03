// Audio player controls and timeline UI.

import { formatTime } from "./audio.js";
import { createMetronome } from "./metronome.js";

export function setupPlayback(elements, getBpm, getSegments) {
  const audio = new Audio();
  audio.preload = "metadata";
  audio.volume = Number(elements.audioVolume.value) / 100;

  const metronome = createMetronome({
    audio,
    enabledInput: elements.metronomeEnabled,
    volumeInput: elements.metronomeVolume,
    getBpm,
    getSegments,
    onStatus: message => { elements.metronomeStatus.textContent = message; }
  });

  elements.audioVolume.addEventListener("input", () => {
    audio.volume = Number(elements.audioVolume.value) / 100;
    elements.audioVolumeValue.textContent = `${elements.audioVolume.value}%`;
  });

  elements.metronomeVolume.addEventListener("input", () => {
    elements.metronomeVolumeValue.textContent = `${elements.metronomeVolume.value}%`;
  });

  elements.playButton.addEventListener("click", async () => {
    if (!audio.src) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (error) {
      console.error(error);
      elements.showError("Unable to play this audio file in your browser.");
    }
  });

  elements.seekBar.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(elements.seekBar.value) / 1000) * audio.duration;
    elements.currentTime.textContent = formatTime(audio.currentTime);
    if (!audio.paused && elements.metronomeEnabled.checked && getBpm()) metronome.start();
  });

  elements.metronomeEnabled.addEventListener("change", () => {
    updateMetronomeStatus();
    if (!elements.metronomeEnabled.checked) metronome.stop();
    else if (!audio.paused && getBpm()) metronome.start();
  });

  audio.addEventListener("loadedmetadata", () => {
    if (!Number.isFinite(audio.duration)) return;
    elements.duration.textContent = formatTime(audio.duration);
    elements.playButton.disabled = false;
    elements.seekBar.disabled = false;
  });

  audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    elements.seekBar.value = (audio.currentTime / audio.duration) * 1000;
    elements.currentTime.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("play", () => {
    elements.playIcon.textContent = "❚❚";
    elements.playButton.setAttribute("aria-label", "Pause audio");
    if (elements.metronomeEnabled.checked && getBpm()) metronome.start();
  });

  audio.addEventListener("pause", () => {
    elements.playIcon.textContent = "▶";
    elements.playButton.setAttribute("aria-label", "Play audio");
    metronome.stop();
  });

  audio.addEventListener("ended", () => {
    elements.playIcon.textContent = "▶";
    elements.playButton.setAttribute("aria-label", "Play audio");
    metronome.stop();
    elements.seekBar.value = 1000;
    elements.currentTime.textContent = formatTime(audio.duration);
  });

  function updateMetronomeStatus() {
    const bpm = getBpm();
    if (!bpm) {
      elements.metronomeBpm.textContent = "— BPM";
      elements.metronomeStatus.textContent = "Turns on after BPM analysis";
      return;
    }
    elements.metronomeBpm.textContent = `${bpm} BPM`;
    elements.metronomeStatus.textContent = elements.metronomeEnabled.checked
      ? "Enabled · Synchronized to playback"
      : "Disabled";
  }

  function load(url) {
    clear();
    audio.src = url;
    audio.load();
    elements.player.hidden = false;
    elements.playButton.disabled = true;
    elements.seekBar.disabled = true;
    elements.playIcon.textContent = "▶";
    elements.seekBar.value = 0;
    elements.currentTime.textContent = "0:00";
    elements.duration.textContent = "0:00";
    updateMetronomeStatus();
  }

  function clear() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    metronome.stop();
    elements.playButton.disabled = true;
    elements.seekBar.disabled = true;
    elements.playIcon.textContent = "▶";
    elements.seekBar.value = 0;
    elements.currentTime.textContent = "0:00";
    elements.duration.textContent = "0:00";
  }

  function refreshTempo() {
    updateMetronomeStatus();
    if (!audio.paused && elements.metronomeEnabled.checked && getBpm()) metronome.start();
  }

  function destroy() {
    clear();
    metronome.destroy();
  }

  return { audio, load, clear, refreshTempo, updateMetronomeStatus, destroy };
}
