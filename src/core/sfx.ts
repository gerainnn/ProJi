/**
 * Lightweight procedural SFX using WebAudio. No asset files required.
 * Initialized lazily on first user interaction (mobile autoplay policy).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;
  private masterGain: GainNode | null = null;

  ensure() {
    if (this.ctx) return;
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.35;
  }
  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
  isMuted(): boolean { return this.muted; }

  private blip(freq: number, duration: number, type: OscillatorType = 'square', glide?: number, vol = 1) {
    this.ensure();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t0 + duration);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4 * vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  click() { this.blip(720, 0.05, 'square'); }
  hit()   { this.blip(220, 0.08, 'sawtooth', 110); }
  crit()  { this.blip(880, 0.12, 'square', 540); this.blip(1320, 0.06, 'square', 700, 0.5); }
  pickup(){ this.blip(540, 0.08, 'triangle', 880); }
  damage(){ this.blip(140, 0.18, 'sawtooth', 60); }
  levelUp(){ this.blip(440, 0.12, 'square', 660); this.blip(660, 0.14, 'square', 880, 0.6); }
  shoot() { this.blip(380, 0.06, 'square', 180, 0.6); }
  death() { this.blip(180, 0.4, 'sawtooth', 40); }
  victory(){ this.blip(523, 0.12); this.blip(659, 0.12); this.blip(784, 0.18); }
}

export const sfx = new Sfx();
