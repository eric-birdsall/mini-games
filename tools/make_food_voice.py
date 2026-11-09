"""Record Food Finder's voice: every phrase it says, packed into one MP3 sprite.

Writes src/assets/food/voice.mp3 (all clips back to back, 0.35 s apart) and
src/assets/food/voice.json ({key: [start_seconds, duration_seconds]}). The
phrases come from voicePhrases() in shared/foodFinder.js, so the keys always
match the game's lines. Same recipe as hungry-monster/tools/make_voice.py.

Needs: kokoro-onnx, soundfile, numpy (the venv in ~/.cache/kokoro), Homebrew
espeak-ng and lame, and kokoro.onnx + voices.bin (in ~/.cache/kokoro).
Usage, from the repo root:
  ~/.cache/kokoro/venv/bin/python tools/make_food_voice.py [voice]   (default af_heart)
"""
import json, os, subprocess, sys, tempfile
from multiprocessing import Pool

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.expanduser("~/.cache/kokoro")
OUT = os.path.join(ROOT, "src", "assets", "food")
GAP = 0.35
kokoro = None


def phrases():
    script = "import('./shared/foodFinder.js').then(m => console.log(JSON.stringify(m.voicePhrases())))"
    return json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, check=True,
                                     capture_output=True, text=True).stdout)


def start_worker():
    global kokoro
    from kokoro_onnx import Kokoro, EspeakConfig
    kokoro = Kokoro(os.path.join(MODELS, "kokoro.onnx"), os.path.join(MODELS, "voices.bin"),
                    espeak_config=EspeakConfig(
                        lib_path="/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib",
                        data_path="/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"))


def trim(a, sr, thresh=0.01, pad=0.04):
    idx = np.where(np.abs(a) > thresh)[0]
    if len(idx) == 0:
        return a
    return a[max(0, idx[0] - int(pad * sr)):min(len(a), idx[-1] + int(pad * sr))]


def record(job):
    key, text, voice = job
    a, sr = kokoro.create(text, voice=voice, speed=0.9, lang="en-us")
    a = trim(np.asarray(a, dtype=np.float32), sr)
    return key, a / max(1e-6, np.abs(a).max()) * 0.89, sr  # even loudness


def main():
    voice = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
    ps = phrases()
    with Pool(4, initializer=start_worker) as pool:
        clips = pool.map(record, [(k, t, voice) for k, t in ps.items()])
    chunks, index, pos, sr = [], {}, 0.0, clips[0][2]
    for key, a, _ in clips:
        index[key] = [round(pos + GAP, 3), round(len(a) / sr, 3)]
        chunks += [np.zeros(int(GAP * sr), np.float32), a]
        pos += GAP + len(a) / sr
    chunks.append(np.zeros(int(GAP * sr), np.float32))
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "voice.wav")
        sf.write(wav, np.concatenate(chunks), sr)
        subprocess.run(["lame", "--quiet", "-m", "m", "-b", "40", wav,
                        os.path.join(OUT, "voice.mp3")], check=True)
    with open(os.path.join(OUT, "voice.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    print(f"done: {len(ps)} clips, {pos:.0f}s of audio")


if __name__ == "__main__":
    main()
