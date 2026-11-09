import { test } from "node:test";
import assert from "node:assert/strict";
import { MenuMusic, MUSIC_TRACKS } from "../src/menuMusic.js";

test("all menu scores produce finite, bounded notes over a complete loop", () => {
  for (const [track, { bpm }] of Object.entries(MUSIC_TRACKS)) {
    if (!bpm) continue;
    const music = new MenuMusic(),
      notes = [],
      brushes = [];
    music.setTrack(track);
    music.voice = (...args) => notes.push(args);
    music.brush = (...args) => brushes.push(args);
    music.staticHit = () => {};
    for (let step = 0; step < 128; step++)
      music.score(step, (step * 30) / bpm, 30 / bpm);
    assert.ok(notes.length > 50, track);
    for (const [frequency, time, duration, volume] of notes) {
      assert.ok(
        [frequency, time, duration, volume].every(Number.isFinite),
        track,
      );
      assert.ok(
        frequency > 0 && frequency < 12000 && duration > 0 && volume <= 0.2,
        track,
      );
    }
    if (track !== "espionage") assert.ok(brushes.length > 0);
  }
});

test("track switching fades the old bus, stops its noise, and resets scheduling", () => {
  const music = new MenuMusic(),
    calls = [];
  music.ctx = { currentTime: 4 };
  music.bus = {
    gain: {
      cancelScheduledValues: (t) => calls.push(["cancel", t]),
      setTargetAtTime: (...args) => calls.push(["fade", ...args]),
    },
  };
  music.noise = { stop: (t) => calls.push(["stop", t]) };
  music.next = 5;
  music.setTrack("espionage");
  assert.equal(music.track, "espionage");
  assert.equal(music.bus, null);
  assert.equal(music.next, null);
  assert.equal(music.retired.length, 1);
  assert.deepEqual(calls, [
    ["cancel", 4],
    ["fade", 0, 4, 0.15],
    ["stop", 4.8],
  ]);
  music.setTrack("invalid");
  assert.equal(music.track, "espionage");
});

test("Covert plays at 88 BPM with deep sustained bass and intermittent static", () => {
  const music = new MenuMusic(),
    bass = [],
    bursts = [];
  assert.equal(music.track, "confetti");
  music.setTrack("covert");
  assert.equal(MUSIC_TRACKS.covert.bpm, 88);
  music.voice = (freq, time, duration) => {
    if (freq < 42 && duration > 1) bass.push(freq);
  };
  music.brush = () => {};
  music.staticHit = (time, duration, pan) =>
    bursts.push({ time, duration, pan });
  for (let step = 0; step < 128; step++)
    music.score(step, (step * 30) / 88, 30 / 88);
  assert.equal(bass.length, 8);
  assert.ok(bursts.length >= 4 && bursts.length <= 15);
  for (const b of bursts) {
    assert.ok(b.duration >= 0.04 && b.duration <= 0.16);
    assert.ok(Math.abs(b.pan) <= 0.7);
  }
  for (let i = 1; i < bursts.length; i++)
    assert.ok(bursts[i].time - bursts[i - 1].time > 2.6);
});
