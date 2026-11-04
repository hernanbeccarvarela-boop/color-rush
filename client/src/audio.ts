// Tiny synthesized sound effects (original, WebAudio-generated — no assets).
import { store } from './store';

let ctx: AudioContext | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;

function ac(): AudioContext | null {
  if (store.get().muted) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, delay = 0, slideTo?: number) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ac(); },
  beep() { tone(520, 0.18, 'square', 0.07); },
  go() { tone(1040, 0.5, 'square', 0.08); tone(780, 0.5, 'triangle', 0.06); },
  lap() { [660, 880, 1100].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.09)); },
  boost() { tone(300, 0.35, 'sawtooth', 0.05, 0, 900); },
  turbo(level: number) {
    if (level === 3) { tone(400, 0.5, 'sawtooth', 0.06, 0, 1400); return; }
    tone(level === 2 ? 500 : 380, 0.3, 'sawtooth', 0.06, 0, level === 2 ? 1300 : 950);
  },
  bump() { tone(110, 0.12, 'square', 0.06, 0, 60); },
  finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.13)); },
  engine(speed: number) {
    const a = ac();
    if (!a) { this.engineStop(); return; }
    if (!engineOsc) {
      engineOsc = a.createOscillator(); engineGain = a.createGain();
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      engineOsc.type = 'sawtooth';
      engineOsc.connect(lp).connect(engineGain).connect(a.destination);
      engineGain.gain.value = 0; engineOsc.start();
    }
    const s = Math.min(1, Math.abs(speed) / 600);
    engineOsc.frequency.setTargetAtTime(55 + s * 170, a.currentTime, 0.05);
    engineGain!.gain.setTargetAtTime(0.015 + s * 0.03, a.currentTime, 0.1);
  },
  engineStop() {
    try { engineOsc?.stop(); } catch { /* already stopped */ }
    engineOsc = null; engineGain = null;
  },
};
