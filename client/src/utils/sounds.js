// Lightweight Web Audio API sound generator
// No external files needed — all synth-generated

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, duration, volume = 0.3) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

export const sounds = {
  cardDraw: () => playTone(440, 'sine', 0.15, 0.2),
  cardFlip: () => { playTone(520, 'sine', 0.1, 0.15); setTimeout(() => playTone(660, 'sine', 0.1, 0.15), 60); },
  swap: () => { playTone(330, 'triangle', 0.1); setTimeout(() => playTone(550, 'triangle', 0.1), 80); },
  spy: () => playTone(800, 'sine', 0.2, 0.15),
  arschmallows: () => {
    [440, 550, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.3), i * 80));
  },
  error: () => playTone(200, 'sawtooth', 0.2, 0.2),
  success: () => { playTone(660, 'sine', 0.15); setTimeout(() => playTone(880, 'sine', 0.2), 100); },
  yourTurn: () => { playTone(550, 'sine', 0.1); setTimeout(() => playTone(660, 'sine', 0.15), 100); },
};

let soundEnabled = localStorage.getItem('arsch_sound') !== 'false';

export function isSoundEnabled() { return soundEnabled; }
export function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('arsch_sound', soundEnabled ? 'true' : 'false');
  return soundEnabled;
}
export function playSound(name) {
  if (soundEnabled && sounds[name]) sounds[name]();
}
