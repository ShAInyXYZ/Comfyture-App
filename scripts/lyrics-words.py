#!/usr/bin/env python3
"""The words of a song and the times they are sung at, heard from the audio (not from the prompt): the vocals separated (Demucs htdemucs),
then faster-whisper's word timestamps on them. Runs where faster-whisper and demucs are (the ComfyUI container); scripts/jam-lyrics.mjs
starts it. Whisper's *words* are never trusted: only their times are used, matched to the lyrics the song was made from
(web/js/lyrics-align.js). The lyrics, when given, bias what Whisper listens for (its initial prompt).

  lyrics-words.py <audio> <language> <out.json> [<lyrics.txt>] [<cuda device index>]
"""
import json
import sys

import soundfile
import torch
import torchaudio
from demucs.apply import apply_model
from demucs.pretrained import get_model
from faster_whisper import WhisperModel

audio, language, out = sys.argv[1:4]
lyrics = open(sys.argv[4], encoding="utf8").read() if len(sys.argv) > 4 and sys.argv[4] != "-" else ""
index = int(sys.argv[5]) if len(sys.argv) > 5 else 3
device = f"cuda:{index}" if torch.cuda.is_available() else "cpu"

# the vocals: htdemucs works at 44.1 kHz stereo
data, rate = soundfile.read(audio, dtype="float32", always_2d=True)
wave = torch.from_numpy(data.T.copy())
model = get_model("htdemucs")
model.eval()
wave = torchaudio.functional.resample(wave, rate, model.samplerate)
if wave.shape[0] == 1:
    wave = wave.repeat(2, 1)
ref = wave.mean(0)
mix = ((wave - ref.mean()) / (ref.std() + 1e-8))[None]
with torch.no_grad():
    sources = apply_model(model, mix.to(device), device=device, split=True, overlap=0.25, progress=False)[0]
vocals = sources[model.sources.index("vocals")].cpu() * (ref.std() + 1e-8) + ref.mean()
mono16 = torchaudio.functional.resample(vocals.mean(0, keepdim=True), model.samplerate, 16000)[0].numpy()
del model, sources
torch.cuda.empty_cache()

# the words, with times
prompt = " ".join(l.strip() for l in lyrics.splitlines() if l.strip() and not l.strip().startswith("["))[:600] or None
whisper = WhisperModel("large-v3", device="cuda" if device != "cpu" else "cpu", device_index=index if device != "cpu" else 0, compute_type="float16" if device != "cpu" else "int8")
# (no voice-activity filter: it takes shouted or sung vocals for noise and drops whole verses. Whisper left alone on a stretch with no voice
# loops on one word, so a heard word is kept only where the separated vocals are really loud, and a loop is dropped below)
segments, info = whisper.transcribe(mono16, language=language or None, word_timestamps=True, vad_filter=False, beam_size=5, condition_on_previous_text=False, initial_prompt=prompt, no_speech_threshold=0.6, compression_ratio_threshold=2.2)
# the voice's loudness every 20 ms: the level a word has to reach
frame = 320
rms = torch.from_numpy(mono16[: len(mono16) // frame * frame]).reshape(-1, frame).pow(2).mean(1).sqrt()
loud = torch.quantile(rms, 0.9).item()
def voiced(start, end):
    a, b = int(start * 50), max(int(end * 50), int(start * 50) + 1)
    return rms[a:b].mean().item() >= 0.05 * loud if a < len(rms) else False
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for seg in segments for w in (seg.words or []) if w.word.strip() and voiced(w.start, w.end)]
# a word said four times running or more with nothing between is a loop, not singing: dropped
kept, run = [], 0
for i, w in enumerate(words):
    run = run + 1 if i and words[i - 1]["w"].lower() == w["w"].lower() else 1
    if run < 4:
        kept.append(w)
    elif run == 4:
        kept = kept[:-3]
words = kept
# the voice's loudness every 0.1 s (1 is the loud end of the singing): when the voice is singing, whatever Whisper made of the words
hop = 1600
steps = len(mono16) // hop
level = torch.from_numpy(mono16[: steps * hop]).reshape(-1, hop).pow(2).mean(1).sqrt()
level = (level / (torch.quantile(level, 0.9) + 1e-8)).clamp(max=3)
voice = [round(float(v), 2) for v in level]
json.dump({"language": info.language, "seconds": round(len(mono16) / 16000, 2), "words": words, "voice": voice, "hop": 0.1}, open(out, "w", encoding="utf8"), ensure_ascii=False)
print(f"{len(words)} words heard in {len(mono16) / 16000:.0f} s")
