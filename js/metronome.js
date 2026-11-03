// Metronome scheduler. AudioContext oscillator clicks are scheduled ahead for timing stability.

const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

export function createMetronome({ audio, enabledInput, volumeInput, getBpm, getSegments, onStatus }) {
  let context = null;
  let timer = null;
  let nextBeatTime = 0;

  function getSegmentAtTime(time) {
    const segments = getSegments();
    if (!segments.length) return { start: 0, bpm: getBpm() };

    let active = segments[0];
    for (const segment of segments) {
      if (segment.start > time) break;
      active = segment;
    }
    return active;
  }

  async function getContext() {
    if (!context || context.state === "closed") {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("AudioContext is unavailable.");
      context = new Context();
    }
    if (context.state === "suspended") await context.resume();
    return context;
  }

  async function start() {
    if (!getBpm() || !enabledInput.checked || audio.paused) return;

    try {
      await getContext();
      if (audio.paused || !enabledInput.checked) return;

      stop();
      const segment = getSegmentAtTime(audio.currentTime);
      const beatDuration = 60 / segment.bpm;

      nextBeatTime = segment.start +
        Math.ceil((audio.currentTime - segment.start) / beatDuration - 0.00001) * beatDuration;

      if (nextBeatTime < audio.currentTime - 0.02) nextBeatTime += beatDuration;

      schedule();
      timer = setInterval(schedule, SCHEDULER_INTERVAL_MS);
    } catch (error) {
      console.error("Metronome error:", error);
      onStatus("Audio unavailable");
    }
  }

  function schedule() {
    if (!context || audio.paused || !enabledInput.checked) {
      stop();
      return;
    }

    const currentTime = audio.currentTime;
    while (nextBeatTime <= currentTime + LOOKAHEAD_SECONDS) {
      const segment = getSegmentAtTime(nextBeatTime);
      const beatDuration = 60 / segment.bpm;
      const segments = getSegments();
      const nextSegment = segments.find(item => item.start > segment.start);

      if (nextSegment && nextBeatTime >= nextSegment.start) {
        nextBeatTime = nextSegment.start;
        continue;
      }

      if (nextBeatTime >= currentTime - 0.02) {
        const delay = Math.max(0, (nextBeatTime - currentTime) / audio.playbackRate);
        playClick(context.currentTime + delay);
      }

      nextBeatTime = nextSegment && nextBeatTime + beatDuration >= nextSegment.start
        ? nextSegment.start
        : nextBeatTime + beatDuration;
    }
  }

  function playClick(time) {
    const volume = Number(volumeInput.value) / 100;
    if (!context || volume <= 0) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1000, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.22 * volume, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.05);

    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function destroy() {
    stop();
    if (context && context.state !== "closed") {
      context.close().catch(() => {});
    }
    context = null;
  }

  return { start, stop, destroy };
}
