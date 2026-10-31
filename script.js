const drop = document.getElementById('drop');
const input = document.getElementById('file');
const result = document.getElementById('result');

input.addEventListener('change', () => input.files[0] && handle(input.files[0]));
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) handle(f); });

function status(msg, cls = '') {
  result.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'status ' + cls;
  p.textContent = msg;
  result.appendChild(p);
}

async function handle(file) {
  status('Analyzing ' + file.name + '…');
  try {
    const buffer = await file.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(buffer);
    ctx.close();
    const bpm = await detectBPM(audio);
    if (!bpm) { status('Could not find a steady beat in this file.', 'error'); return; }
    show(file.name, bpm);
  } catch (err) {
    console.error(err);
    status('This file could not be read as audio. Try an MP3, WAV, or M4A file.', 'error');
  }
}

async function detectBPM(audio) {
  // Analyze up to 60 seconds from the middle of the track
  const sr = audio.sampleRate;
  const maxLen = Math.min(audio.length, sr * 60);
  const start = Math.max(0, Math.floor((audio.length - maxLen) / 2));

  const offline = new OfflineAudioContext(1, maxLen, sr);
  const src = offline.createBufferSource();
  src.buffer = audio;
  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 150;
  lowpass.Q.value = 1;
  src.connect(lowpass);
  lowpass.connect(offline.destination);
  src.start(0, start / sr, maxLen / sr);
  const filtered = await offline.startRendering();

  const peaks = findPeaks(filtered.getChannelData(0), sr);
  if (peaks.length < 8) return null;

  // Count how often each tempo shows up between nearby peaks
  const groups = new Map();
  for (let i = 0; i < peaks.length; i++) {
    for (let j = 1; j <= 10 && i + j < peaks.length; j++) {
      let tempo = 60 / ((peaks[i + j] - peaks[i]) / sr);
      if (!isFinite(tempo) || tempo < 20) continue;
      while (tempo < 75) tempo *= 2;
      while (tempo > 175) tempo /= 2;
      const key = Math.round(tempo);
      const g = groups.get(key) || { count: 0, sum: 0 };
      g.count++; g.sum += tempo;
      groups.set(key, g);
    }
  }

  // Score each tempo with its neighbors so near-identical values reinforce each other
  let best = null, bestScore = 0;
  for (const [key, g] of groups) {
    const n1 = groups.get(key - 1), n2 = groups.get(key + 1);
    const score = g.count + (n1 ? n1.count * .5 : 0) + (n2 ? n2.count * .5 : 0);
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best ? Math.round(best.sum / best.count) : null;
}

function findPeaks(data, sr) {
  const skip = Math.floor(sr / 4); // at most 4 beats per second
  let threshold = 0.9, peaks = [];
  let max = 0;
  for (let i = 0; i < data.length; i += 16) { const v = Math.abs(data[i]); if (v > max) max = v; }
  if (max === 0) return [];
  while (threshold >= 0.25) {
    peaks = [];
    const level = max * threshold;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > level) { peaks.push(i); i += skip; }
    }
    if (peaks.length >= 30) break;
    threshold -= 0.05;
  }
  return peaks;
}

function show(name, bpm) {
  result.innerHTML = '';
  const n = document.createElement('p');
  n.className = 'name';
  n.textContent = name;

  const row = document.createElement('div');
  row.className = 'bpm';
  const out = document.createElement('output');
  out.textContent = bpm;
  const lab = document.createElement('label');
  lab.textContent = 'BPM';
  row.append(out, lab);

  const beat = document.createElement('div');
  beat.className = 'beat';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.setProperty('--period', (60 / bpm) + 's');
  const txt = document.createElement('span');
  txt.textContent = 'Pulse at the detected tempo';
  beat.append(dot, txt);

  result.append(n, row, beat);
}
