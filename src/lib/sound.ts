"use client";

// Effets sonores synthétisés avec la Web Audio API : aucun fichier à télécharger ni à héberger.

let ctx: AudioContext | null = null;
const MUTE_KEY = "unboxipe-muted";

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* stockage indisponible */ }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "triangle", vol = 0.18) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** Froissement du paquet qu'on secoue. */
export function playShake() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < 4; i++) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.12);
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2500 + Math.random() * 1500;
    const g = ac.createGain();
    const s = t + i * 0.13;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.12, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.11);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(s);
  }
}

/** Déchirure de l'emballage : bruit filtré balayé + crépitements, puis souffle. */
export function playTear() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const dur = 0.55;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(900, t);
  bp.frequency.exponentialRampToValueAtTime(4200, t + dur);
  const g = ac.createGain();
  // Enveloppe irrégulière = aspect « crépitant » du papier qui se déchire
  g.gain.setValueAtTime(0.0001, t);
  for (let k = 0; k < 18; k++) g.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.35, t + (k / 18) * dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);

  // Souffle d'ouverture
  const w = ac.createBufferSource();
  w.buffer = noiseBuffer(ac, 0.7);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, t + 0.4);
  lp.frequency.exponentialRampToValueAtTime(2400, t + 0.75);
  lp.frequency.exponentialRampToValueAtTime(400, t + 1.1);
  const wg = ac.createGain();
  wg.gain.setValueAtTime(0.0001, t + 0.4);
  wg.gain.exponentialRampToValueAtTime(0.22, t + 0.7);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  w.connect(lp).connect(wg).connect(ac.destination);
  w.start(t + 0.4);

  // Petit scintillement
  [1568, 2093, 2637].forEach((f, i) => tone(ac, f, t + 0.6 + i * 0.05, 0.35, "sine", 0.06));
}

/** Distribution des cartes. */
export function playDeal(index: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.08);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 3000 + index * 150;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
}

// Arpèges de plus en plus riches selon la rareté révélée
const REVEAL: Record<string, number[]> = {
  COMMON: [523],
  UNCOMMON: [523, 784],
  RARE: [523, 659, 784],
  EPIC: [523, 659, 784, 1047],
  LEGENDARY: [392, 523, 659, 784, 1047, 1319],
};

export function playReveal(rarity: string) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = REVEAL[rarity] ?? REVEAL.COMMON;
  const step = rarity === "LEGENDARY" ? 0.09 : 0.07;
  notes.forEach((f, i) => tone(ac, f, t + i * step, rarity === "COMMON" ? 0.25 : 0.5, i % 2 ? "sine" : "triangle", 0.16));
  if (rarity === "EPIC" || rarity === "LEGENDARY") {
    const end = t + notes.length * step;
    tone(ac, notes[notes.length - 1], end, 1.2, "sine", 0.12);
    tone(ac, notes[notes.length - 1] * 1.5, end, 1.2, "sine", 0.07);
    for (let i = 0; i < 8; i++) tone(ac, 2000 + Math.random() * 2500, end + i * 0.06, 0.2, "sine", 0.04);
  }
}

/* ───── Assemblage (fabrication de produit, construction d'usine) ───── */

/** Une carte rejoint le centre : souffle court dont la hauteur monte à chaque carte. */
export function playMergeStep(index: number, total: number, heavy = false) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.25);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 2;
  const base = heavy ? 400 : 900;
  f.frequency.setValueAtTime(base, t);
  f.frequency.exponentialRampToValueAtTime(base * 3, t + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
  // Note qui monte d'un degré à chaque carte absorbée
  const scale = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880, 1047, 1175];
  const note = scale[Math.min(scale.length - 1, Math.round((index / Math.max(1, total - 1)) * (scale.length - 1)))];
  tone(ac, heavy ? note / 2 : note, t + 0.18, 0.22, heavy ? "square" : "sine", heavy ? 0.06 : 0.1);
  if (heavy) tone(ac, 70, t + 0.18, 0.18, "sine", 0.25); // impact sourd
}

/** Apparition du produit fabriqué : accord lumineux + scintillements. */
export function playCraftDone() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [523, 659, 784, 1047].forEach((f) => tone(ac, f, t, 1.1, "triangle", 0.1));
  [1319, 1568, 2093].forEach((f, i) => tone(ac, f, t + 0.08 + i * 0.07, 0.5, "sine", 0.06));
  for (let i = 0; i < 6; i++) tone(ac, 2400 + Math.random() * 2000, t + 0.25 + i * 0.05, 0.15, "sine", 0.035);
}

/** Apparition de l'usine : coup métallique, vapeur, puis accord grave et cuivré. */
export function playFactoryDone() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  // Coup de marteau métallique
  tone(ac, 55, t, 0.5, "sine", 0.35);
  [523, 1046, 1569, 2350].forEach((f, i) => tone(ac, f * 1.003, t, 0.9 - i * 0.15, "square", 0.025));
  // Vapeur
  const st = ac.createBufferSource();
  st.buffer = noiseBuffer(ac, 0.9);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
  st.connect(hp).connect(g).connect(ac.destination);
  st.start(t + 0.15);
  // Accord final
  [131, 196, 262, 330, 392].forEach((f, i) => tone(ac, f, t + 0.45 + i * 0.04, 1.4, i < 2 ? "sawtooth" : "triangle", i < 2 ? 0.04 : 0.09));
}

/** Passage de niveau d'une usine. */
export function playLevelUp() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [392, 523, 659, 784, 1047].forEach((f, i) => tone(ac, f, t + i * 0.06, 0.35, "square", 0.05));
  tone(ac, 1047, t + 0.32, 0.8, "triangle", 0.12);
  tone(ac, 1568, t + 0.32, 0.8, "sine", 0.06);
}
