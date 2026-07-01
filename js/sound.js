class SoundFx {
  constructor() {
    this.muted = false;
    this.ctx = null;
  }
  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  play(name) {
    if (this.muted) return;
    try {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const presets = {
        shoot: { type: 'square', f0: 520, f1: 220, dur: 0.08, vol: 0.06 },
        explosion: { type: 'sawtooth', f0: 180, f1: 40, dur: 0.28, vol: 0.14 },
        powerup: { type: 'triangle', f0: 300, f1: 720, dur: 0.22, vol: 0.09 },
        hit: { type: 'square', f0: 260, f1: 80, dur: 0.12, vol: 0.1 },
        start: { type: 'triangle', f0: 220, f1: 660, dur: 0.35, vol: 0.1 },
      };
      const p = presets[name] || presets.shoot;
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.f0, t0);
      osc.frequency.linearRampToValueAtTime(p.f1, t0 + p.dur);
      gain.gain.setValueAtTime(p.vol, t0);
      gain.gain.linearRampToValueAtTime(0, t0 + p.dur);
      osc.start(t0);
      osc.stop(t0 + p.dur + 0.02);
    } catch (e) { /* 忽略音频异常 */ }
  }
}
