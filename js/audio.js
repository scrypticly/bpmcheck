// Audio decoding and small audio-related helpers.

export function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Your browser does not support audio analysis.");
  }
  return new AudioContextClass();
}

export async function decodeAudioFile(file, context) {
  const data = await file.arrayBuffer();
  return context.decodeAudioData(data.slice(0));
}

export function mixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  const channelCount = audioBuffer.numberOfChannels;

  for (let channel = 0; channel < channelCount; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      mono[i] += data[i] / channelCount;
    }
  }

  return mono;
}

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatBpmTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 100);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}.${String(milliseconds).padStart(2, "0")}`;
}
