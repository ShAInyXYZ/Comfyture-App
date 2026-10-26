# ACE-Step 1.5 XL: what the three guides say, where they differ, and what Pickle's guide does

Read on 26 October 2026, the pages themselves (not summaries from memory), and read again the same day, claim by claim, to check this record (nine claims from the Tutorial, eight from the Musician's Guide, eight from deAPI: all hold, with the two wording notes below):

1. [ACE-Step 1.5 Tutorial](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/Tutorial.md)
2. [ACE-Step 1.5 Musician's Guide](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/ace_step_musicians_guide.md)
3. [deAPI: ACE-Step 1.5 prompting guide](https://deapi.ai/blog/ace-step-1-5-prompting-guide-how-to-write-tags-structure-lyrics-and-generate-better-music)

plus the owner's saved workflow (`AceStep1.5XL-SuperiorShiny.json` on their ComfyUI) and its example prompt, their LoRAs
(`/app/models/loras/ace-step/*`, each with a metadata sidecar), and the sessions in which they had tuned ACE-Step before (ClaudeSense).
The result is [`knowledge/jam/acestep-guide.md`](../../knowledge/jam/acestep-guide.md), which both Pickles read.

## What each says

| Topic | Tutorial | Musician's Guide | deAPI |
|---|---|---|---|
| The caption (tags) | "the most important factor"; keywords or prose; cover genre, emotion, instruments, timbre, era, production, vocals, tempo feel; specific beats vague; resolve conflicting styles by repeating the one you want or by saying how they change over time | brief it like session musicians: genre, instruments, mood, production; one to two sentences of descriptors; vague ("a sad song") leaves too much to chance | formula *genre, mood, 2 to 3 instruments, vocal, production, BPM*; 5 to 12 keywords (over 15 dilutes); genre first; keywords not prose; no contradictions |
| BPM, key in the caption | **no**: use the fields | the fields | **yes**, BPM in both |
| Structure tags | `[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro] [Build] [Drop] [Breakdown] [Instrumental] [Guitar Solo] [Piano Interlude] [Fade Out] [Silence]`; a hyphen then one descriptor; stacking tags makes the model sing them | the same, plus the "roadmap trick": a bare tag sequence maps the energy | lower-case, `[inst]`, `[build-up]`; a tag with no words under it is an instrumental, **an empty `[chorus]` is silence** |
| Line length | 6 to 10 syllables, same position within 1 to 2 | 6 to 10 | 4 to 8 flows, 12+ fractures; repeat the chorus; AABB or ABAB |
| Emphasis | UPPERCASE stronger, (parentheses) backing vocals, vowel stretches unstable | the same | |
| BPM, key, time, length | BPM 30 to 300 (60 to 180 stable); common keys (C, G, D, Am, Em) stable, rare ones ignored; 4/4 most reliable; 30 to 60 s and 2 to 4 min stable; **values are anchors** (120 may land at 118); "slow ballad" with 160 bpm confuses | slow 60 to 80, medium 90 to 120, fast 130 to 180; examples 60, 180, 300 s | per-genre BPM table (ballad 60 to 80, lo-fi 70 to 90, pop 100 to 120, house 120 to 128, techno 128 to 140, trap 130 to 145, d&b 170 to 180); a mismatch confuses |
| Lyrics vs length | no rule: plan and test | none | none; XL holds a 200 s+ song together, the 3.5B turbo loses coherence after about 3 min |
| Language | set `vocal_language` if auto-detect is wrong | 50+ languages | `[en] [ja] [fr]...` markers at a section start; without one, non-English words get English phonetics |
| Instrumental | `[Instrumental]` | | either empty lyrics + "no vocals", or section tags with no text: "pick one approach and commit"; writing "no vocals" **with** lyric text gives eerie wordless vocals |
| Models and steps | turbo 8 (its default), **sft "more steps (50)"** (not called a default), base 32 to 100; sft favours detail, base supports extract/lego/complete; XL needs 12 GB+ | turbo for drafts, **sft or base for finals** | XL turbo: niche genres and long form hold; base 27 steps typical |
| Planner (LM) | on by default; infers metadata, rewrites the caption: so keep prompts sane | thinking mode only for text-to-music | |
| LoRA | | one at a time (loading another replaces it); scale 0 to 100%; about an hour to train on 8 to 20 songs | |
| Practice | fix the seed to tune; batch and screen | **generate 2 to 4 takes and pick**; repaint a weak section instead of redoing | |

## From each rule of the guide back to its source

T = Tutorial, M = Musician's Guide, D = deAPI, O = the owner's own workflow or practice (each checked against the pages in the second reading).

| Rule in `knowledge/jam/acestep-guide.md` | From |
|---|---|
| Tags are the most important input; keywords, specific, several dimensions | T, M, D |
| Genre first; one primary genre and at most one modifier; no contradictions | D, T |
| Instruments specific (3 to 5) and the drum feel; the voice (gender, delivery); one or two production words | M, D, T |
| "no autotune, raw human voice" in the tags when the voice should sound human | O |
| BPM, key and time signature never in the tags; they are fields | T, O |
| The words must agree with the tempo ("slow ballad" with a fast bpm confuses) | T, D |
| BPM 60 to 180, common keys, 4/4 are the stable choices; the values are anchors | T |
| BPM ranges by genre (lo-fi 70 to 85, pop 100 to 120, ...) | D, M |
| Whole songs of 200 to 300 s; the XL holds a long song together | D (XL holds 200 s+), T (2 to 4 min stable), **O (200 to 300 s, E minor)** |
| E minor as the default key | **O** |
| Section tags on their own line, a blank line between; the list of tags | T, M, D |
| One short hint after a dash, never stacked (the model sings the tag) | T, M |
| Lines of 6 to 10 syllables, the same length in the same place | T, M (D says 4 to 8: the guide keeps 6 to 10) |
| A chorus repeated word for word; rhyme in pairs | D, O (their example) |
| UPPERCASE for a shout, (parentheses) for backing vocals, vowel stretches sparingly | T, M |
| Never an empty `[Chorus]` (silence) | D |
| Instrumental: `[Instrumental]` and "instrumental, no vocals", not words plus "no vocals" | D |
| Tags and lyrics must agree (a female vocal with a "deep male voice" hint) | T |
| One line every 4 to 5 s; instrumental sections instead of padding | **O** (their example: about 38 lines for 200 s), T and D give no rule |
| Full is three passes, Draft the first alone; roll two or three takes and pick | O (Superior's chain), M (generate 2 to 4) |
| Language is a field; the words in that language, the tags in English | T, O |
| One style LoRA at a time, its trigger word first in the caption (`<trigger>, <description>, <tags>`), at the documented strength 1.0; for beats and wordless songs only | M (one at a time), the LoRAs' own metadata (trigger, template, strength), **our own test** (sung words) |
| No artist names in the tags; nothing that names a real person | the owner's rule for the app (no unlicensed IP) |

## Where they disagree, and what the guide does

- **BPM in the tags** (deAPI yes, Tutorial no): **no**. The Tutorial and the owner's own saved prompt keep it out; the model reads the field. The words must still agree with it ("slow" with a slow bpm).
- **Syllables** (6 to 10 vs 4 to 8): **6 to 10** for sung lines (two sources and the owner's example), tighter for a rap.
- **How many tags** (5 to 12 vs the owner's ~20): **10 to 18**, genre first. The owner's own working prompt has about 20 descriptors; deAPI's "15 dilutes" is for the small models.
- **Lyrics for a length**: no source gives one. The owner's example is ~38 sung lines for 200 s, so **one line every 4 to 5 s**, and instrumental sections ([Instrumental], [Guitar Solo]) instead of padding, which the sources agree is the failure.
- **Language markers** (deAPI) vs the language field (Tutorial, the owner's workflow): the **field**; the owner's Japanese example has no marker.
- **Duration**: stable 2 to 4 min per the Tutorial; the owner finds **200 to 300 s with E minor** works great on the XL: that is the default (240 s, E minor), the maximum 300.

Wording notes from the second reading: deAPI's own page says both 4 to 8 syllables flow and, elsewhere, that lines over 10 break the timing; its "stacking" warning is for five niche genres ("one primary genre plus one modifier is the ceiling"), which the guide rounds to "four or five"; and its instrumental advice is to pick one of two approaches, not a ban on mixing them in every form.

## What came only from the owner

The Superior settings (XL sft, three passes 30/20/15 at denoise 1/0.25/0.15, cfg 2.5, temperature 0.75, top_p 0.9, audio codes on, `jkass_quality`
= plain Heun, then their `AudioQualityEnhancer`), the tag style of their example ("... no autotune, raw human voice"), `[Verse 1 - rapid rap]`-style
hints, 200 s and E minor. Comfy Cloud has neither the sampler nor the enhancer, so Jam's Cloud workflow uses `heun` and no master.

## LoRAs found, and what we found out

Nine, all for the XL (trained on XL turbo on 12 to 15 synthetic tracks each, instrumental fraction 0 to 0.2): acoustic, dream pop, electropop, experimental, indie, j-pop,
jazz, lo-fi, pop (`/app/models/loras/ace-step/`). Each one's own documentation (README and metadata sidecar) says: a **trigger word** that must appear in the prompt, the
caption template **`<trigger>, <description>, <tags>`**, **strength 1.0**, no tested range, and (for the XL turbo they were trained on) 8 steps, guidance 7, shift 3.
The owner's own LoRA workflow (`AceStep-MusicGen_Lora.json`, the kaola ACE-Step wrapper) runs the XL **sft** with the 4B planner (off), 50 steps, guidance 9, shift 2,
strength 1, then their enhancer.

**Two ways the LoRA was not actually applied, found on 26 October:**
- Through the kaola nodes (the owner's workflow) PEFT needs `adapter_model.safetensors` in the LoRA's folder; the folders hold the weights under a renamed file
  (`j_pop-xl-v1.safetensors`), PEFT falls through to a Hugging Face hub lookup, fails (`HFValidationError`), and the node goes on **without** the LoRA, silently. A symlink named
  `adapter_model.safetensors` to the real file (added to `j_pop-xl-v1/`) makes it load (`LoRA adapter 'j_pop-xl-v1' loaded, targets=256, scale 1.0`). The other eight folders
  have the same naming and would fail the same way.
- Through ComfyUI's own `LoraLoaderModelOnly` (what the app's engine uses) the LoRA **does** apply: the same song at strength 1 and at strength 0 differs by 36%, while
  strength 0 against itself differs by 0.0.

**What a LoRA does to a sung song.** The same Japanese anime-opening song, same lyrics, tags, key, tempo, length and seed, three ways; the number of words a speech model
hears in the vocals, and of the 41 written lines how many it finds:

| Render | words heard | lines found |
|---|---|---|
| kaola graph, LoRA did not load (the first run) | 413 | 40 |
| the owner's Superior graph, no LoRA | 373 | 38 |
| kaola graph with the j_pop LoRA loaded, strength 1 | **99** | **13** |

So the LoRA, at its documented strength, makes sung words unintelligible, and the earlier measurements at other strengths (Petit Matin with the acoustic LoRA, Chameleon Lights with
the electropop one) point the same way. **A LoRA is for beats and wordless songs.** (This is a speech-model reading of how clearly the words are sung, a diagnostic: whether the music is
good is the owner's ear's call.)

## Not verified

No source documents a duet method or keeping one voice across songs (tags are the only lever; a reference-audio timbre input exists in the nodes but is
not wired into Jam's workflow). Whether a LoRA trained on XL turbo behaves on sft is the owner's own practice (their LoRA workflow runs the
experimental one on sft), not a documented claim.
