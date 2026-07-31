let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep(freq: number, durationMs: number, type: OscillatorType = 'square', volume = 0.15): void {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

export const playEat      = (): void => beep(880, 80);
export const playHit      = (): void => beep(440, 60);
export const playWall     = (): void => beep(220, 40, 'triangle');
export const playScore    = (): void => beep(660, 120);
export const playMerge    = (gained: number): void => beep(220 + Math.log2(Math.max(2, gained)) * 40, 70);
export const playGameOver = (): void => beep(110, 300, 'sawtooth', 0.2);
export const playWin      = (): void => {
  beep(523, 100);
  setTimeout(() => beep(659, 100), 100);
  setTimeout(() => beep(784, 150), 200);
};

// Continuous engine rumble (start while thrusting, stop on release) — only
// one instance can run at a time, matching the single-active-plugin app shell.
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineLfo: OscillatorNode | null = null;

export function startEngineSound(): void {
  if (engineOsc) return;
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 45; // low rumble, not a whine
  filter.type = 'lowpass';
  filter.frequency.value = 300; // strips the sawtooth's harsh upper harmonics
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 8;
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  osc.start(now);
  lfo.start(now);

  engineOsc = osc;
  engineGain = gain;
  engineLfo = lfo;
}

export function stopEngineSound(): void {
  if (!engineOsc || !engineGain) return;
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;
  engineGain.gain.cancelScheduledValues(now);
  engineGain.gain.setValueAtTime(engineGain.gain.value, now);
  engineGain.gain.linearRampToValueAtTime(0, now + 0.05);
  engineOsc.stop(now + 0.06);
  engineLfo?.stop(now + 0.06);
  engineOsc = null;
  engineGain = null;
  engineLfo = null;
}

export function playLaunch(): void {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.start(now);
  osc.stop(now + 0.16);
}

// Continuous in-flight whoosh (start on launch, stop on impact) — mirrors
// the engine-rumble start/stop pattern above; only one shell flies at a time.
// Filtered looping noise reads as soft wind rather than a piercing siren.
let whistleNoise: AudioBufferSourceNode | null = null;
let whistleGain: GainNode | null = null;
let whistleFilter: BiquadFilterNode | null = null;

export function startMissileWhistle(): void {
  if (whistleNoise) return;
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const bufferSize = audioCtx.sampleRate; // 1s loop, long enough to avoid audible seams
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 380;
  filter.Q.value = 0.7;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.035, now + 0.08);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start(now);

  whistleNoise = noise;
  whistleGain = gain;
  whistleFilter = filter;
}

export function stopMissileWhistle(): void {
  if (!whistleNoise || !whistleGain) return;
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;
  whistleGain.gain.cancelScheduledValues(now);
  whistleGain.gain.setValueAtTime(whistleGain.gain.value, now);
  whistleGain.gain.linearRampToValueAtTime(0, now + 0.06);
  whistleNoise.stop(now + 0.07);
  whistleNoise = null;
  whistleGain = null;
  whistleFilter = null;
}

export function playExplosion(): void {
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const bufferSize = Math.floor(audioCtx.sampleRate * 0.4);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(1800, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(120, now + 0.4);
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.4);

  const thump = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(100, now);
  thump.frequency.exponentialRampToValueAtTime(35, now + 0.25);
  thumpGain.gain.setValueAtTime(0.25, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  thump.start(now);
  thump.stop(now + 0.26);
}

export function playCannonFire(): void {
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const bufferSize = Math.floor(audioCtx.sampleRate * 0.08);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 800;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.2, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.08);

  const thump = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, now);
  thump.frequency.exponentialRampToValueAtTime(50, now + 0.1);
  thumpGain.gain.setValueAtTime(0.22, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  thump.start(now);
  thump.stop(now + 0.11);
}

export function playSplash(): void {
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const bufferSize = Math.floor(audioCtx.sampleRate * 0.3);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
  filter.Q.value = 1.2;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.3);
}

// Ship-sinking cue — layers the shared explosion with a descending hull groan
// and a delayed secondary blast for a bigger, more final-feeling hit.
export function playShipSunk(): void {
  playExplosion();
  const audioCtx = getCtx();
  const now = audioCtx.currentTime;

  const groan = audioCtx.createOscillator();
  const groanFilter = audioCtx.createBiquadFilter();
  const groanGain = audioCtx.createGain();
  groan.type = 'sawtooth';
  groan.frequency.setValueAtTime(220, now + 0.1);
  groan.frequency.exponentialRampToValueAtTime(40, now + 1.1);
  groanFilter.type = 'lowpass';
  groanFilter.frequency.value = 500;
  groanGain.gain.setValueAtTime(0, now);
  groanGain.gain.linearRampToValueAtTime(0.12, now + 0.25);
  groanGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
  groan.connect(groanFilter);
  groanFilter.connect(groanGain);
  groanGain.connect(audioCtx.destination);
  groan.start(now + 0.1);
  groan.stop(now + 1.15);

  setTimeout(playExplosion, 180);
}
