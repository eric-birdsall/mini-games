import { MenuMusic } from "./menuMusic.js";
import { MOVEMENT_AUDIO, CONFIG } from "../shared/config.js";
// Procedural placeholder effects; unlocked only by an explicit player gesture.
export class AudioFeedback {
  constructor() {
    this.music = new MenuMusic();
    this.context = null;
    this.enabled = true;
    this.steps = new Map();
    this.levels = structuredClone(MOVEMENT_AUDIO);
  }
  unlock() {
    try {
      this.context ||= new AudioContext();
      this.context.resume();
    } catch {}
  }
  tone(frequency, duration = 0.1, offset = 0, volume = 0.045) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
  footstep(kind, pan = 0, attenuation = 1) {
    if (!this.context || !this.enabled || !this.levels[kind]) return;
    const spec = this.levels[kind],
      ctx = this.context,
      now = ctx.currentTime;
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * spec.duration),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      panner = ctx.createStereoPanner();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = spec.cutoff;
    const volume = Math.max(
      0.0001,
      spec.gain * this.levels.master * attenuation,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
    source.start(now);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    // Foot impacts distinguish walking from the soft continuous crawling scrape.
    if (kind !== "crawl")
      this.tone(
        kind === "sprint" ? 95 : kind === "walk" ? 80 : 65,
        0.1,
        0,
        volume * 0.55,
      );
  }
  movement(state, view, dt) {
    if (!state || !["prep", "active"].includes(state.phase)) {
      this.steps.clear();
      return;
    }
    // Players, character decoys and noisemakers all make footsteps.
    for (const p of [
      ...state.players,
      ...(state.decoys || []),
      ...(state.noises || []),
    ]) {
      const kind = p.noise;
      if (!p.alive || !this.levels[kind]) {
        this.steps.delete(p.id);
        continue;
      }
      let step = this.steps.get(p.id);
      if (!step || step.kind !== kind) step = { kind, time: 0 };
      step.time -= dt;
      if (step.time <= 0) {
        const me = state.me,
          dx = p.x - me.x,
          dz = p.z - me.z,
          range = Math.hypot(dx, dz);
        const nominal = {
          crawl: CONFIG.proneSpeed,
          crouch: CONFIG.crouchSpeed,
          walk: CONFIG.walkSpeed,
          sprint: CONFIG.sprintSpeed,
        }[kind];
        const speedRatio = Math.max(
          0.15,
          Math.min(1, (p.moveSpeed ?? nominal) / nominal),
        );
        const attenuation =
          p.id === me.id ? 1 : 1 / (1 + Math.pow(range / 5, 2));
        if (range < 35 || p.id === me.id)
          this.footstep(
            kind,
            (dx * Math.cos(view.yaw) - dz * Math.sin(view.yaw)) / (range || 1),
            attenuation * speedRatio,
          );
        step.time = this.levels[kind].interval / Math.max(0.3, speedRatio);
      }
      this.steps.set(p.id, step);
    }
  }
  // A camera's pan motor: a short, rising electric whir.
  servo(pan = 0, attenuation = 1) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context,
      now = ctx.currentTime,
      motor = ctx.createOscillator(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      panner = ctx.createStereoPanner(),
      volume = Math.max(0.0001, 0.09 * this.levels.master * attenuation);
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(210, now);
    motor.frequency.linearRampToValueAtTime(270, now + 0.2);
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 3;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    motor.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
    motor.start(now);
    motor.stop(now + 0.24);
    motor.onended = () => {
      motor.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }
  // Cameras someone else is panning whir from where they hang, like
  // footsteps: louder up close, panned left/right by direction.
  cameras(state, view) {
    if (!state?.me || !["prep", "active"].includes(state.phase)) return;
    const me = state.me,
      now = performance.now();
    this.whirs ||= new Map();
    for (const g of state.gadgets) {
      if (!(g.panning > 0) || g.owner === me.id) continue;
      if (now - (this.whirs.get(g.id) || 0) < 200) continue;
      const dx = g.x - me.x,
        dz = g.z - me.z,
        range = Math.hypot(dx, dz);
      if (range > 35) continue;
      this.whirs.set(g.id, now);
      this.servo(
        (dx * Math.cos(view.yaw) - dz * Math.sin(view.yaw)) / (range || 1),
        1 / (1 + Math.pow(range / 6, 2)),
      );
    }
  }
  // While a detection timer runs, pulses that quicken and climb with it.
  // `level` is 0..1 of the way to being seen. Infiltrators hear a heartbeat;
  // sentinels hear a lock-on tick.
  detection(level, team, dt) {
    if (!(level > 0)) {
      this.pulseIn = 0;
      return;
    }
    this.pulseIn = (this.pulseIn || 0) - dt;
    if (this.pulseIn > 0) return;
    const l = Math.min(1, level),
      v = 0.05 + 0.05 * l;
    if (team === "attacker") {
      this.pulseIn = 0.85 - 0.6 * l;
      this.tone(95 + 70 * l, 0.14, 0, v);
      this.tone(80 + 60 * l, 0.16, 0.13, v * 0.8);
    } else {
      this.pulseIn = 0.45 - 0.3 * l;
      this.tone(900 + 700 * l, 0.05, 0, v * 0.6);
    }
  }
  // A ping landing: two quick bright notes.
  // Filtered noise for watery sounds; the filter sweeps from one frequency
  // to another over its length.
  noise(pan, volume, length, type, from, to, delay = 0) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context,
      now = ctx.currentTime + delay,
      buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * length),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      panner = ctx.createStereoPanner();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + length);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
    source.start(now);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }
  // A water balloon leaving someone's hand: a soft rising whoosh.
  whoosh(pan = 0, attenuation = 1) {
    this.noise(pan, 0.08 * attenuation, 0.28, "bandpass", 500, 1800);
  }
  // A water balloon bursting: a rubbery pop, then a slosh of water.
  splash(pan = 0, attenuation = 1) {
    this.tone(420, 0.06, 0, 0.07 * attenuation);
    this.noise(pan, 0.3 * attenuation, 0.5, "lowpass", 3800, 500, 0.02);
    this.noise(pan, 0.1 * attenuation, 0.35, "bandpass", 1400, 700, 0.12);
  }
  // A glitter popper (kid-friendly flashbang): a pop and a run of chimes.
  sparkle() {
    this.tone(330, 0.08, 0, 0.08);
    [1568, 2093, 2637, 3136, 2349].forEach((f, i) =>
      this.tone(f, 0.35, 0.05 + i * 0.06, 0.03),
    );
  }
  // A flashbang: a heavy thump under a ringing whine.
  bang() {
    this.tone(70, 0.45, 0, 0.16);
    this.tone(110, 0.3, 0.02, 0.12);
    this.tone(3200, 1.4, 0.05, 0.03);
  }
  // The preparation countdown: a longer beep at 10 s, short ones from 5 to
  // 1, and the longest as the round starts (0).
  countdown(seconds) {
    if (seconds === 0) this.tone(1320, 1.1, 0, 0.09);
    else if (seconds === 10) this.tone(880, 0.45, 0, 0.08);
    else this.tone(1040, 0.14, 0, 0.08);
  }
  // Feet hitting a wall to run along it: a scuff and a scrape.
  wallRun() {
    this.tone(150, 0.12, 0, 0.09);
    this.tone(260, 0.3, 0.05, 0.035);
    this.tone(210, 0.25, 0.32, 0.03);
  }
  // A pulse sensor sweeping: a descending sonar ping.
  pulse(attenuation = 1) {
    this.tone(1900, 0.5, 0, 0.06 * attenuation);
    this.tone(950, 0.7, 0.04, 0.05 * attenuation);
  }
  ping() {
    this.tone(1180, 0.07, 0, 0.04);
    this.tone(1570, 0.1, 0.07, 0.035);
  }
  event(text) {
    if (text === "Sidearm fired.") {
      this.tone(75, 0.16, 0, 0.13);
      this.tone(900, 0.045, 0, 0.045);
      return;
    }

    if (/triggered|Immobilized|tangled/i.test(text)) {
      this.tone(180, 0.3);
      this.tone(140, 0.25, 0.2);
    } else if (/Scanning|signature/i.test(text)) {
      this.tone(720, 0.09);
      this.tone(1040, 0.1, 0.12);
    } else if (/deployed|disabled|anchor/i.test(text)) {
      this.tone(380, 0.07);
      this.tone(620, 0.12, 0.07);
    } else if (/win|underway/i.test(text)) {
      this.tone(400, 0.13);
      this.tone(600, 0.18, 0.15);
    }
  }
}
