export const MUSIC_TRACKS = {
  confetti: {
    name: "Confetti Level",
    url: new URL("./assets/audio/confetti-level.mp3", import.meta.url).href,
  },
  backyard: { name: "Backyard Sunshine", bpm: 112 },
  silent: {
    name: "Silent Perimeter",
    url: new URL("./assets/audio/silent-perimeter.mp3", import.meta.url).href,
  },
  espionage: { name: "Cold Espionage", bpm: 72 },
  covert: { name: "Covert Technology", bpm: 88 },
};
// Recorded menu soundtrack plus the original procedural scores.
// Uses the game's gesture-unlocked AudioContext.
export class MenuMusic {
  constructor() {
    this.volume = 0.35;
    // The top bar's mute button silences music without losing the volume.
    this.muted = false;
    this.track = "confetti";
    this.retired = [];
    try {
      const track = localStorage.getItem("minigames-music-track");
      // Switch everyone to the supplied soundtrack once, then keep honoring later
      // selections.
      if (localStorage.getItem("minigames-music-edition") !== "confetti-1") {
        localStorage.setItem("minigames-music-track", "confetti");
        localStorage.setItem("minigames-music-edition", "confetti-1");
      } else if (MUSIC_TRACKS[track]) this.track = track;
      const saved = Number(localStorage.getItem("minigames-music-volume"));
      if (
        localStorage.getItem("minigames-music-volume") !== null &&
        Number.isFinite(saved)
      )
        this.volume = Math.max(0, Math.min(1, saved));
      this.muted = localStorage.getItem("minigames-music-muted") === "1";
    } catch {}
  }
  setTrack(track) {
    if (!MUSIC_TRACKS[track] || track === this.track) return;
    this.track = track;
    try {
      localStorage.setItem("minigames-music-track", track);
    } catch {}
    if (this.bus) {
      const now = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.setTargetAtTime(0, now, 0.15);
      this.noise?.stop(now + 0.8);
      this.noise = null;
      this.retired.push({
        bus: this.bus,
        compressor: this.compressor,
        until: now + 1,
      });
      this.bus = null;
    }
    this.target = undefined;
    this.next = null;
    this.nextStatic = null;
  }
  setVolume(value) {
    this.volume = Number(value);
    try {
      localStorage.setItem("minigames-music-volume", String(this.volume));
    } catch {}
  }
  setMuted(muted) {
    this.muted = !!muted;
    try {
      localStorage.setItem("minigames-music-muted", this.muted ? "1" : "0");
    } catch {}
  }
  init(ctx) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    this.compressor = compressor;
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    this.bus.connect(compressor);
    compressor.connect(ctx.destination);
    const recording = MUSIC_TRACKS[this.track].url;
    if (recording) {
      const bus = this.bus;
      this.recordingBuffers ||= new Map();
      if (!this.recordingBuffers.has(recording))
        this.recordingBuffers.set(
          recording,
          fetch(recording)
            .then((response) => {
              if (!response.ok) throw new Error("Menu soundtrack unavailable");
              return response.arrayBuffer();
            })
            .then((data) => ctx.decodeAudioData(data))
            .catch((error) => {
              this.recordingBuffers.delete(recording);
              console.warn("Menu music:", error);
              return null;
            }),
        );
      this.recordingBuffers.get(recording).then((buffer) => {
        if (!buffer || this.bus !== bus) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(bus);
        source.start();
        this.noise = source;
      });
      return;
    }
    // A quiet filtered radio bed, seamless at the loop boundary.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const envelope = Math.sin((Math.PI * i) / (data.length - 1)) ** 2;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    this.noise = noise;
    this.noiseBuffer = buffer;
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 1500;
    filter.Q.value = 0.8;
    gain.gain.value = this.track === "espionage" ? 0.018 : 0;
    noise.connect(filter).connect(gain).connect(this.bus);
    noise.start();
  }
  voice(freq, time, duration, volume, type = "sine", pan = 0, cutoff = 800) {
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      volume,
      time + Math.min(0.4, duration * 0.15),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    stereo.pan.value = pan;
    osc.connect(filter).connect(gain).connect(stereo).connect(this.bus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
  }
  brush(time, volume, duration = 0.12, cutoff = 4200) {
    const ctx = this.ctx,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.bus);
    source.start(time, 1, duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  staticHit(time, duration, pan) {
    const ctx = this.ctx,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    // Fresh sparse crackles, rather than a slice of the gently swelling
    // noise bed. Tiny noise packets and hard gaps read as radio interference.
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      ),
      samples = buffer.getChannelData(0);
    for (let at = 0; at < samples.length;) {
      const length = Math.floor(
          ctx.sampleRate * (0.001 + Math.random() * 0.004),
        ),
        amplitude = 0.3 + Math.random() * 0.7;
      for (let i = 0; i < length && at + i < samples.length; i++)
        samples[at + i] =
          (Math.random() * 2 - 1) * amplitude * (1 - i / length);
      at +=
        length + Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.018));
    }
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 1700 + Math.random() * 1600;
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0.055 + Math.random() * 0.025, time);
    stereo.pan.value = pan;
    source.connect(filter).connect(gain).connect(stereo).connect(this.bus);
    source.start(time);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
  }
  score(step, t, eighth) {
    const hz = (note) => 440 * 2 ** ((note - 69) / 12);
    if (this.track === "backyard") {
      this.backyard(step, t, eighth);
      return;
    }
    if (this.track === "covert") {
      // Slower gated sequencer with sustained sub accents and irregular radio bursts.
      const root = [30, 30, 33, 29][Math.floor(step / 32)];
      if (step % 32 === 0 || step % 32 === 24) {
        // 33–41 Hz fundamentals, with a quiet octave for smaller speakers.
        const bass = hz(root - 5);
        this.voice(bass, t, eighth * 7, 0.16, "sine", 0, 160);
        this.voice(bass * 2, t, eighth * 5, 0.035, "triangle", 0, 220);
      }
      this.nextStatic ??= t + 1 + Math.random() * 3;
      if (t >= this.nextStatic) {
        this.staticHit(
          t + Math.random() * eighth,
          0.04 + Math.random() * 0.12,
          Math.random() * 1.4 - 0.7,
        );
        this.nextStatic = t + 3 + Math.random() * 5;
      }
      if ([0, 3, 6].includes(step % 8)) {
        this.voice(hz(root), t, 0.23, 0.18, "sine");
        this.voice(58, t, 0.09, 0.07, "triangle", 0, 180);
      }
      const note = root + 24 + [0, 12, 7, 1, 0, 7, 15, 7][step % 8];
      this.voice(
        hz(note),
        t,
        0.12,
        step % 2 ? 0.025 : 0.045,
        "square",
        step % 2 ? 0.5 : -0.5,
        step % 4 ? 900 : 2100,
      );
      this.brush(
        t,
        step % 4 === 2 ? 0.12 : 0.035,
        step % 4 === 2 ? 0.14 : 0.035,
        3200,
      );
      if (step % 16 === 15)
        for (const offset of [0, 0.33, 0.66])
          this.voice(1700, t + eighth * offset, 0.035, 0.012, "sine", 0.65);
      if (step % 32 === 0)
        for (const interval of [12, 19])
          this.voice(hz(root + interval), t, 4, 0.018, "triangle", -0.4, 500);
      return;
    }
    this.espionage(step, t, eighth);
  }
  // `audible` is how loud to play, 0 to 1, as a share of the volume (true
  // counts as 1); a change glides there.
  update(ctx, audible) {
    if (!ctx || ctx.state !== "running") return;
    for (const old of this.retired)
      if (ctx.currentTime >= old.until) {
        old.bus.disconnect();
        old.compressor.disconnect();
      }
    this.retired = this.retired.filter((old) => ctx.currentTime < old.until);
    if (!this.bus) this.init(ctx);
    const now = ctx.currentTime,
      target = this.muted ? 0 : this.volume * (Number(audible) || 0);
    if (target !== this.target) {
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.setTargetAtTime(target, now, 0.4);
      this.target = target;
    }
    if (MUSIC_TRACKS[this.track].url) return;
    if (!audible || !this.volume || this.muted) {
      this.next = null;
      return;
    }
    if (this.next == null || this.next < now - 0.2) {
      this.next = now + 0.05;
      this.step = 0;
      this.nextStatic = null;
    }
    const eighth = 60 / MUSIC_TRACKS[this.track].bpm / 2;
    while (this.next < now + 0.18) {
      this.score(this.step % 128, this.next, eighth);
      this.step++;
      this.next += eighth;
    }
  }
  espionage(step, t, eighth) {
    // D minor, B-flat, G minor, A suspended: restrained, unresolved.
    const root = [38, 34, 31, 33][Math.floor(step / 32)],
      hz = (note) => 440 * 2 ** ((note - 69) / 12);
    if (step % 4 === 0) {
      this.voice(hz(root), t, 1.2, 0.19, "sine");
      this.voice(hz(root + 12), t, 0.5, 0.045, "triangle", 0, 280);
    }
    if (step % 16 === 0)
      for (const [i, interval] of [12, 19, 26].entries())
        this.voice(
          hz(root + interval),
          t,
          eighth * 19,
          0.025,
          "triangle",
          (i - 1) * 0.6,
          650,
        );
    if ([2, 6, 9, 14].includes(step % 16)) {
      const note = root + 24 + [0, 7, 14, 7][Math.floor(step / 2) % 4];
      this.voice(
        hz(note),
        t,
        0.65,
        0.035,
        "triangle",
        step % 4 ? -0.45 : 0.45,
        1200,
      );
      this.voice(hz(note), t + eighth * 0.75, 0.8, 0.012, "sine", 0.6);
    }
    if (step % 16 === 12)
      for (const partial of [1, 1.47, 2.13])
        this.voice(780 * partial, t, 0.25, 0.009, "sine", -0.6);
  }
  // C, F, G, C (and back via A minor): a sunny, bouncy, major-key loop with
  // a plucky marimba-like tune, a bouncing bass and a light shaker.
  backyard(step, t, eighth) {
    const hz = (note) => 440 * 2 ** ((note - 69) / 12),
      bar = Math.floor(step / 16) % 8,
      root = [48, 53, 55, 48, 57, 53, 55, 48][bar],
      major = bar === 4 ? [0, 3, 7] : [0, 4, 7];
    // Bass: root on the beat, fifth on the off-beat.
    if (step % 4 === 0)
      this.voice(hz(root - 12), t, 0.35, 0.16, "triangle", 0, 500);
    if (step % 4 === 2)
      this.voice(hz(root - 5), t, 0.25, 0.09, "triangle", 0, 500);
    // Plucked chord on beats 2 and 4.
    if (step % 8 === 4)
      for (const [i, n] of major.entries())
        this.voice(
          hz(root + 12 + n),
          t,
          0.3,
          0.03,
          "triangle",
          (i - 1) * 0.4,
          2200,
        );
    // Shaker: light on every eighth, a little stronger on the off-beats.
    this.brush(t, step % 2 ? 0.05 : 0.025, 0.05, 6000);
    // The tune: a skipping melody over the chord, marimba-ish (sine plus a
    // quiet octave). Every fourth bar answers with a higher phrase.
    const tune = (
      bar % 4 === 3
        ? [
            7,
            null,
            9,
            12,
            null,
            12,
            9,
            null,
            7,
            null,
            4,
            null,
            7,
            null,
            null,
            null,
          ]
        : [0, null, 4, 7, null, 7, 9, null, 7, null, 4, null, 2, 4, null, null]
    )[step % 16];
    if (tune !== null) {
      const f = hz(root + 24 + (tune === 4 && bar === 4 ? 3 : tune));
      this.voice(f, t, 0.28, 0.05, "sine", 0.2, 3000);
      this.voice(f * 2, t, 0.12, 0.012, "sine", 0.2, 4000);
    }
    // A little birdsong chirp now and then.
    if (step % 64 === 46)
      for (const [i, n] of [96, 100, 98].entries())
        this.voice(hz(n), t + eighth * 0.22 * i, 0.07, 0.008, "sine", 0.7);
  }
}
