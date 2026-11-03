import { createAudioContext, decodeAudioFile, mixToMono, formatBytes, formatBpmTime } from "./audio.js";
import { buildOnsetEnvelope, estimateBpm } from "./bpm.js";
import { detectBpmChanges } from "./tempo-changes.js";
import { setupPlayback } from "./playback.js";

const $ = id => document.getElementById(id);

const el = {
  fileInput: $("audioFile"),
  dropZone: $("dropZone"),
  fileInfo: $("fileInfo"),
  fileName: $("fileName"),
  fileMeta: $("fileMeta"),
  analyzeButton: $("analyzeButton"),
  removeFileButton: $("removeFile"),
  progressWrap: $("progressWrap"),
  progressBar: $("progressBar"),
  progressPercent: $("progressPercent"),
  statusText: $("statusText"),
  result: $("result"),
  bpmValue: $("bpmValue"),
  resultNote: $("resultNote"),
  retryButton: $("retryButton"),
  errorMessage: $("errorMessage"),
  player: $("player"),
  playButton: $("playButton"),
  playIcon: $("playIcon"),
  seekBar: $("seekBar"),
  currentTime: $("currentTime"),
  duration: $("duration"),
  metronomeEnabled: $("metronomeEnabled"),
  metronomeStatus: $("metronomeStatus"),
  metronomeBpm: $("metronomeBpm"),
  audioVolume: $("audioVolume"),
  audioVolumeValue: $("audioVolumeValue"),
  metronomeVolume: $("metronomeVolume"),
  metronomeVolumeValue: $("metronomeVolumeValue"),
  bpmSwitchesEnabled: $("bpmSwitchesEnabled"),
  bpmChanges: $("bpmChanges"),
  bpmTableBody: $("bpmTableBody"),
  bpmMarkers: $("bpmMarkers")
};

let selectedFile = null;
let audioURL = null;
let isAnalyzing = false;
let bpmSegments = [];

const playback = setupPlayback({
  ...el,
  showError
}, getBpm, () => bpmSegments);

function getBpm() {
  const bpm = Number(el.bpmValue.textContent);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function showError(message) {
  el.errorMessage.textContent = message;
  el.errorMessage.hidden = false;
}

function setProgress(percent, message) {
  el.progressBar.style.width = `${percent}%`;
  el.progressPercent.textContent = `${Math.round(percent)}%`;
  if (message) el.statusText.textContent = message;
}

function setFile(file) {
  if (!file) return;

  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(file.name)) {
    showError("Please choose a supported audio file.");
    return;
  }

  resetPlaybackSource();
  selectedFile = file;
  audioURL = URL.createObjectURL(file);
  playback.load(audioURL);

  el.fileName.textContent = file.name;
  el.fileMeta.textContent = `${formatBytes(file.size)} · Ready to analyze`;
  el.fileInfo.hidden = false;
  el.dropZone.hidden = true;
  el.analyzeButton.disabled = false;
  el.result.hidden = true;
  el.progressWrap.hidden = true;
  el.errorMessage.hidden = true;
  clearTempoResults();
  playback.updateMetronomeStatus();
}

function resetPlaybackSource() {
  playback.clear();
  if (audioURL) {
    URL.revokeObjectURL(audioURL);
    audioURL = null;
  }
}

function clearTempoResults() {
  bpmSegments = [];
  el.bpmValue.textContent = "--";
  el.metronomeBpm.textContent = "— BPM";
  el.bpmChanges.hidden = true;
  el.bpmTableBody.innerHTML = "";
  el.bpmMarkers.innerHTML = "";
}

function reset() {
  resetPlaybackSource();
  selectedFile = null;
  el.fileInput.value = "";
  el.fileInfo.hidden = true;
  el.player.hidden = true;
  el.dropZone.hidden = false;
  el.analyzeButton.disabled = true;
  el.progressWrap.hidden = true;
  el.result.hidden = true;
  el.errorMessage.hidden = true;
  clearTempoResults();
  setProgress(0, "");
  playback.updateMetronomeStatus();
}

function renderBpmChanges() {
  el.bpmTableBody.innerHTML = "";
  el.bpmMarkers.innerHTML = "";

  if (bpmSegments.length <= 1 || !Number.isFinite(playback.audio.duration)) {
    el.bpmChanges.hidden = true;
    return;
  }

  el.bpmChanges.hidden = false;

  bpmSegments.forEach((segment, index) => {
    const row = document.createElement("tr");
    const timeCell = document.createElement("td");
    const bpmCell = document.createElement("td");

    timeCell.textContent = formatBpmTime(segment.start);
    bpmCell.textContent = `${segment.bpm} BPM`;
    row.append(timeCell, bpmCell);
    el.bpmTableBody.appendChild(row);

    if (index === 0) return;
    const marker = document.createElement("div");
    marker.className = "bpm-marker";
    marker.style.left = `${(segment.start / playback.audio.duration) * 100}%`;
    marker.title = `${segment.bpm} BPM at ${formatBpmTime(segment.start)}`;
    el.bpmMarkers.appendChild(marker);
  });
}

async function analyzeSelectedFile() {
  if (!selectedFile || isAnalyzing) return;

  isAnalyzing = true;
  el.analyzeButton.disabled = true;
  el.result.hidden = true;
  el.errorMessage.hidden = true;
  el.progressWrap.hidden = false;
  setProgress(3, "Loading audio…");

  let context;

  try {
    context = createAudioContext();
    setProgress(12, "Decoding audio…");
    const audioBuffer = await decodeAudioFile(selectedFile, context);

    setProgress(30, "Detecting rhythmic patterns…");
    const mono = mixToMono(audioBuffer);
    const onsets = buildOnsetEnvelope(mono, audioBuffer.sampleRate, percent => {
      setProgress(30 + percent * 0.55, "Detecting rhythmic patterns…");
    });

    let estimate;

    if (el.bpmSwitchesEnabled.checked) {
      setProgress(92, "Checking for tempo changes…");
      bpmSegments = detectBpmChanges(onsets.values, onsets.rate);

      if (!bpmSegments?.length) {
        throw new Error("We couldn't reliably detect the tempo of this song.");
      }

      estimate = { bpm: bpmSegments[0].bpm, confidence: 1 };
    } else {
      estimate = estimateBpm(onsets.values, onsets.rate);
      if (!estimate || !Number.isFinite(estimate.bpm)) {
        throw new Error("We couldn't find a steady beat in this audio. Try a clearer section or another file.");
      }
      bpmSegments = [{ start: 0, bpm: Math.round(estimate.bpm) }];
    }

    el.bpmValue.textContent = String(Math.round(estimate.bpm));

    if (el.bpmSwitchesEnabled.checked) {
      el.resultNote.textContent = bpmSegments.length > 1
        ? `Detected ${bpmSegments.length} tempo sections throughout the song.`
        : "No clear tempo changes detected. The song appears to have a steady tempo.";
    } else {
      el.resultNote.textContent = estimate.confidence < 1.15
        ? "Estimated tempo — this track may have a loose or changing beat."
        : "Estimated tempo detected from the audio.";
    }

    renderBpmChanges();
    el.result.hidden = false;
    setProgress(100, "Analysis complete");
    playback.refreshTempo();
  } catch (error) {
    console.error(error);
    showError(error.message || "Something went wrong while analyzing this file.");
    el.progressWrap.hidden = true;
  } finally {
    if (context && context.state !== "closed") {
      try { await context.close(); } catch (_) {}
    }
    isAnalyzing = false;
    el.analyzeButton.disabled = !selectedFile;
  }
}

// File selection and drag-and-drop.
el.fileInput.addEventListener("change", () => setFile(el.fileInput.files[0]));
el.removeFileButton.addEventListener("click", reset);
el.retryButton.addEventListener("click", reset);
el.analyzeButton.addEventListener("click", analyzeSelectedFile);

["dragenter", "dragover"].forEach(type => {
  el.dropZone.addEventListener(type, event => {
    event.preventDefault();
    el.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(type => {
  el.dropZone.addEventListener(type, event => {
    event.preventDefault();
    el.dropZone.classList.remove("dragging");
  });
});

el.dropZone.addEventListener("drop", event => {
  setFile(event.dataTransfer.files[0]);
});
