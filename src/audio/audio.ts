// Original procedural audio with WebAudio. Starts muted; the player must explicitly enable sound.
export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = false;
  private noise: AudioBuffer | null = null;
  private ambience: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  volume = 0.7;

  enable(): void {
    if (this.enabled) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        // gentle pink-ish noise (deterministic LCG; audio only)
        const w = ((Math.imul(i + 1, 1103515245) + 12345) >>> 0) / 4294967296 - 0.5;
        b = 0.97 * b + w * 0.3;
        d[i] = b + w * 0.2;
      }
      this.startAmbience();
    }
    this.ctx.resume();
    this.enabled = true;
    if (this.master) this.master.gain.value = this.volume;
  }

  disable(): void {
    this.enabled = false;
    if (this.master) this.master.gain.value = 0;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.enabled) this.master.gain.value = v;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private startAmbience(): void {
    const c = this.ctx!;
    // murmur of a crowded settlement: band-passed noise with slow swells
    const src = this.noiseSrc();
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.8;
    const gain = c.createGain();
    gain.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    this.ambience = { gain, filter };
    // machinery hum (lift motors)
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 240;
    const hg = c.createGain();
    hg.gain.value = 0;
    osc.connect(hf).connect(hg).connect(this.master!);
    osc.start();
    this.hum = { osc, gain: hg };
  }

  /** Per-frame ambience mix: crowd density, lift motor activity. */
  setMix(crowd: number, motor: number): void {
    if (!this.ctx || !this.ambience || !this.hum) return;
    const t = this.ctx.currentTime;
    this.ambience.gain.gain.setTargetAtTime(0.03 + crowd * 0.07, t, 0.5);
    this.ambience.filter.frequency.setTargetAtTime(300 + crowd * 400, t, 0.5);
    this.hum.gain.gain.setTargetAtTime(motor * 0.05, t, 0.15);
    this.hum.osc.frequency.setTargetAtTime(50 + motor * 18, t, 0.2);
  }

  play(name: string, vol = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const c = this.ctx;
    const t = c.currentTime;
    const env = (g: GainNode, a: number, peak: number, d: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const tone = (freq: number, type: OscillatorType, a: number, d: number, peak: number, when = 0, slide = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + when);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + when + a + d);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + when);
      g.gain.exponentialRampToValueAtTime(peak * vol, t + when + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + a + d);
      o.connect(g).connect(this.master!);
      o.start(t + when);
      o.stop(t + when + a + d + 0.05);
    };
    const hiss = (freq: number, q: number, a: number, d: number, peak: number, type: BiquadFilterType = 'bandpass') => {
      const s = this.noiseSrc();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      env(g, a, peak * vol, d);
      s.connect(f).connect(g).connect(this.master!);
      s.start(t, Math.random() * 1.5);
      s.stop(t + a + d + 0.05);
    };
    switch (name) {
      case 'step':
        hiss(1800 + Math.random() * 900, 2.5, 0.004, 0.06, 0.08);
        break;
      case 'jump':
        hiss(900, 1.5, 0.01, 0.12, 0.08);
        break;
      case 'land':
        hiss(500, 1, 0.005, 0.14, 0.16);
        break;
      case 'collect':
        tone(880, 'triangle', 0.01, 0.12, 0.12);
        tone(1320, 'triangle', 0.01, 0.18, 0.1, 0.07);
        break;
      case 'coin':
        tone(1568, 'sine', 0.005, 0.25, 0.1);
        tone(2093, 'sine', 0.005, 0.3, 0.07, 0.05);
        break;
      case 'eat':
        hiss(2400, 3, 0.01, 0.08, 0.1);
        hiss(2000, 3, 0.01, 0.08, 0.1);
        break;
      case 'drink':
        tone(420, 'sine', 0.02, 0.15, 0.1, 0, 1.6);
        break;
      case 'repair':
        for (let i = 0; i < 4; i++) {
          tone(300 + i * 40, 'square', 0.003, 0.07, 0.05, i * 0.13);
          hiss(3000, 4, 0.002, 0.05, 0.06);
        }
        break;
      case 'ui':
        tone(660, 'triangle', 0.005, 0.06, 0.06);
        break;
      case 'error':
        tone(220, 'square', 0.005, 0.14, 0.05, 0, 0.8);
        break;
      case 'lift':
        tone(110, 'sawtooth', 0.05, 0.6, 0.04, 0, 1.3);
        break;
      case 'rumble':
        tone(38, 'sine', 1.2, 3.0, 0.35, 0, 0.8);
        hiss(120, 0.7, 1.2, 3.0, 0.25, 'lowpass');
        break;
      case 'whoosh':
        hiss(600, 0.6, 0.8, 1.6, 0.3);
        break;
      case 'impact':
        tone(46, 'sine', 0.005, 1.4, 0.7, 0, 0.6);
        hiss(260, 0.6, 0.005, 0.9, 0.6, 'lowpass');
        hiss(3200, 1.5, 0.002, 0.35, 0.18);
        break;
      case 'cheer':
        for (let i = 0; i < 6; i++) hiss(700 + i * 160, 4, 0.08, 0.6 + i * 0.1, 0.05);
        break;
      case 'jab':
        hiss(2600, 2, 0.003, 0.08, 0.09);
        break;
      case 'hit':
        tone(160, 'square', 0.003, 0.09, 0.08, 0, 0.6);
        hiss(900, 1.2, 0.002, 0.1, 0.12);
        break;
      case 'twang':
        tone(520, 'triangle', 0.002, 0.25, 0.09, 0, 0.5);
        break;
      case 'skitter':
        for (let i = 0; i < 5; i++) hiss(4200 + i * 300, 6, 0.002, 0.03, 0.05);
        break;
      case 'door':
        hiss(1400, 6, 0.3, 1.2, 0.08);
        break;
      case 'zap':
        tone(1800, 'sawtooth', 0.01, 0.5, 0.08, 0, 0.15);
        tone(90, 'square', 0.02, 0.6, 0.12, 0, 0.5);
        hiss(5000, 1, 0.005, 0.5, 0.2);
        break;
      case 'splash':
        hiss(700, 0.8, 0.005, 0.7, 0.4, 'lowpass');
        hiss(2600, 1.2, 0.01, 0.5, 0.18);
        tone(140, 'sine', 0.005, 0.4, 0.2, 0, 0.5);
        break;
      case 'cough':
        for (let i = 0; i < 2; i++) {
          tone(170, 'sawtooth', 0.01, 0.12, 0.05, i * 0.28, 0.7);
          const s = i * 0.28;
          tone(260, 'triangle', 0.01, 0.1, 0.03, s, 0.6);
        }
        hiss(900, 1.4, 0.01, 0.16, 0.12);
        break;
      case 'voice':
        // a giant child talking through glass: slow, muffled, formant-ish wobble
        for (let i = 0; i < 4; i++) tone(70 + ((i * 37) % 50), 'sawtooth', 0.12, 0.35, 0.09, i * 0.42, i % 2 ? 1.25 : 0.8);
        hiss(220, 2, 0.2, 1.6, 0.12, 'lowpass');
        break;
    }
  }
}
