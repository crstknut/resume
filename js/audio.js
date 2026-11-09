// Tiny chiptune engine: one original 4-bar loop that changes key and timbre per chapter, plus SFX.
window.Sound = (() => {
  let ac = null, master, music, sfxBus, noiseBuf;
  let muted = false;
  try { muted = localStorage.getItem('resume-muted') === '1'; } catch (e) { /* storage blocked */ }
  let running = false, step = 0, nextT = 0, timer = 0;
  let key = 0, lead = 'square', hats = 1;

  const BPM = 118, STEP = 60 / BPM / 4;
  // I – vi – IV – V, semitones from the tonic
  const ROOTS = [0, 9, 5, 7];
  const MAJOR = [0, 4, 7, 12], MINOR = [0, 3, 7, 12];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 3, 2, 1, -1];
  // sparse melody on top: [step, chord tone index + octave]
  const MEL = { 0: 3, 3: 2, 6: 3, 10: 4, 14: 3, 16: 2, 19: 1, 22: 2, 26: 3, 32: 3, 35: 4, 38: 5, 42: 4, 48: 3, 51: 2, 54: 1, 58: 0 };
  const CHAPTER = [
    { key: 0, lead: 'triangle', hats: 0 },
    { key: 2, lead: 'square', hats: 1 },
    { key: 2, lead: 'triangle', hats: 0 },  // north: same key as the lab, softer
    { key: 4, lead: 'square', hats: 1 },
    { key: 5, lead: 'square', hats: 1 },
    { key: 7, lead: 'square', hats: 2 },
    { key: 9, lead: 'sawtooth', hats: 2 },
    { key: 12, lead: 'triangle', hats: 1 },
  ];

  function init() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.22; master.connect(ac.destination);
    music = ac.createGain(); music.gain.value = 0.55; music.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const hz = (semi) => 220 * Math.pow(2, semi / 12);

  function tone(freq, t, dur, type, vol, dest, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || music);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol, hp, dest) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || music);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function playStep(t) {
    const s = step % 64, bar = Math.floor(s / 16), within = s % 16;
    const root = ROOTS[bar], chord = bar === 1 ? MINOR : MAJOR;
    // bass on eighths
    if (within % 2 === 0) tone(hz(key + root - 24), t, STEP * 1.8, 'triangle', within % 4 === 0 ? 0.32 : 0.2);
    // arpeggio
    const a = ARP[within];
    if (a >= 0) tone(hz(key + root + chord[a]), t, STEP * 0.9, 'square', 0.035);
    // melody
    if (MEL[s] !== undefined) {
      const idx = MEL[s], oct = Math.floor(idx / 4) * 12;
      tone(hz(key + root + chord[idx % 4] + 12 + oct), t, STEP * 2.6, lead, lead === 'sawtooth' ? 0.04 : 0.06);
    }
    // drums
    if (within % 4 === 0) tone(140, t, 0.12, 'sine', 0.45, music, 45);
    if (hats && within % 2 === 1) noise(t, 0.03, 0.05, 7000);
    if (hats > 1 && within % 4 === 3) noise(t + STEP / 2, 0.02, 0.035, 9000);
    if (within === 4 || within === 12) noise(t, 0.09, 0.09, 1800);
  }

  function tick() {
    if (!running || !ac) return;
    while (nextT < ac.currentTime + 0.12) { playStep(nextT); nextT += STEP; step++; }
  }

  function start() {
    init(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    if (running) return;
    running = true; step = 0; nextT = ac.currentTime + 0.05;
    timer = setInterval(tick, 25);
  }

  function stop() { running = false; clearInterval(timer); }

  function chapter(i) {
    const c = CHAPTER[Math.min(i, CHAPTER.length - 1)] || CHAPTER[0];
    key = c.key; lead = c.lead; hats = c.hats;
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('resume-muted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.22, ac.currentTime, 0.05);
  }

  function sfx(name) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    switch (name) {
      case 'jump': tone(320, t, 0.14, 'square', 0.08, sfxBus, 640); break;
      case 'pick': tone(hz(key + 24), t, 0.07, 'square', 0.09, sfxBus); tone(hz(key + 31), t + 0.07, 0.12, 'square', 0.09, sfxBus); break;
      case 'stomp': noise(t, 0.12, 0.25, 400, sfxBus); tone(220, t, 0.12, 'square', 0.1, sfxBus, 80); break;
      case 'bump': tone(160, t, 0.12, 'square', 0.08, sfxBus, 90); break;
      case 'card': tone(hz(key + 19), t, 0.18, 'triangle', 0.14, sfxBus); tone(hz(key + 24), t + 0.09, 0.3, 'triangle', 0.12, sfxBus); break;
      case 'level': [0, 4, 7, 12, 16].forEach((n, i) => tone(hz(key + 12 + n), t + i * 0.06, 0.16, 'square', 0.07, sfxBus)); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => tone(hz(key + 12 + n), t + i * 0.09, 0.25, 'square', 0.08, sfxBus)); break;
    }
  }

  return { start, stop, chapter, sfx, setMuted, get muted() { return muted; }, get running() { return running; } };
})();
