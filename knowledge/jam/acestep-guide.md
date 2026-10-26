# Writing a song for ACE-Step 1.5 XL (Pickle's guide)

Sources: the ACE-Step 1.5 Tutorial and Musician's Guide (github.com/ace-step/ACE-Step-1.5/docs/en), deAPI's prompting guide, and the
owner's own AceStep1.5XL-Superior workflow, whose settings are the defaults. Where the sources differ, the owner's practice wins.

## What the model is given

Two inputs that must agree, and four settings that anchor them:

- **Tags** (the caption): the sound. The most important input.
- **Lyrics**: the song as a script in time: words, section tags, how each part is sung.
- **BPM, key, time signature, language**: anchors, not commands (BPM 120 may land at 118). The model reads them from their own fields.
- **Length** in seconds.

Nothing else is needed. The model reads tags and lyrics together and plans the song (the XL's planner is on: audio codes).

## The settings, and how they fit each other

- **Length: make whole songs, 200 to 300 s.** The model is poor at short songs with short prompts, and a whole song can be cut later. 30 to 60 s
  and 2 to 4 min are the stable ranges; the XL holds a long song together, a small model loses it after about 3 min. Default 240 s.
- **Key: E minor works great for songs of 200 to 300 s.** Common keys (E, A, D, G, C minor or major) are stable; rare keys get shifted or
  ignored. Minor for dark, driving, nostalgic or sultry songs, major only for bright, sunny ones. Never write the key in the tags.
- **BPM: 60 to 180 is stable.** Slow 60 to 80, mid 90 to 120, fast 130 to 180. Never write the BPM in the tags. The words must agree with it:
  "slow ballad" with 160 bpm confuses the model, "techno" at 70 does too.
- **Time signature: 4/4** unless it is a waltz (3/4) or a lilt (6/8). Others are unreliable.
- **Language: set it** (en, fr, ja...). The words are in that language; the tags and section tags stay in English.
- **Lines of words for a length:** one sung line for every 4 to 5 seconds (a rap line every 3), the rest being the music between. A 240 s song is
  about 45 lines. Never pad: to fill a long song, add instrumental sections ([Instrumental], [Guitar Solo], [Piano Interlude]) rather than more verses.
- **Quality:** Full is the XL in three passes (the first from nothing, two light refinements). Draft is the first pass alone, for trying an idea.
- **Roll more than one take.** A new seed gives a new performance of the same words; pick the best of two or three.

## Tags

One comma-separated line of keywords, not a sentence. About 10 to 18 descriptors; far more dilutes them. In this order:

1. **Genre first** (the anchor): one primary genre and at most one modifier ("lo-fi hip hop", "pop-punk anthem", "90s R&B slow jam").
   Stacking four or five genres collapses into mush.
2. **Mood and energy**: "late-night, tender", "rebellious, high-energy".
3. **Instruments, specific**: three to five ("warm Rhodes electric piano" beats "keys"; "fingerpicked nylon guitar" beats "guitar"), and the **drum feel**
   ("laid-back swung boom-bap drums", "tight live drums with a double-time snare").
4. **The voice**: gender and delivery ("breathy intimate female lead vocal", "raspy male lead with gang shouts"), or "instrumental, no vocals".
   Add "no autotune, raw human voice" when it should sound human.
5. **Production**, one or two words ("dusty vinyl crackle, warm tape saturation", "wide and glossy", "raw and loud").

Rules: no artist names, no lyrics, no BPM, no key in the tags. No contradictions ("aggressive, serene"; "lo-fi, hi-fi"). To favour one of two
styles, repeat its word; to move between styles, say so over time ("starts as a ballad, builds to anthemic rock"). If a song is instrumental,
write "instrumental, no vocals" in the tags and only `[Instrumental]` in the lyrics, never both words and "no vocals".

## Lyrics

- **Layout:** each section tag on its own line in square brackets, a blank line between sections. Tags: [Intro], [Verse 1], [Pre-Chorus],
  [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro], [Instrumental], [Guitar Solo], [Piano Interlude], [Build], [Drop], [Breakdown], [Fade Out].
- **One short hint after a dash**, at most four words: [Chorus - chant hook], [Verse 1 - rapid rap], [Bridge - stripped beat], [Final Chorus - peak energy].
  Never stack several hints: the model sings the tag or gets lost. Vocal hints that work: whispered, raspy, falsetto, belting, spoken, harmonies,
  call and response, gang vocal chant, soft hums.
- **Lines of 6 to 10 syllables** (a rap can run tighter), the same length in the same place of each verse (within 1 or 2 syllables). A line over 12
  breaks the rhythm. Short, singable, one idea each.
- **A chorus repeats word for word** each time it comes: that is what makes the melody lock in. Rhyme in pairs (AABB) or alternately (ABAB).
- **UPPERCASE** for a shouted word, **(parentheses)** for backing vocals or echoes. Use vowel stretches ("ooh-oooh") sparingly: unstable.
- **Never an empty [Chorus]**: a section tag with no words under it is silence or an instrumental. Say [Instrumental] on purpose.
- **Say concrete things** (a place, an object, a gesture), not abstractions; no stacked adjectives or mixed metaphors. Avoid the cliches that
  make a song sound generated: neon, moonlight, hold on tight, dreams, tonight, fire, "feel the beat".
- **Shape of a full song, 200 to 300 s:** [Intro] (instrumental or two lines) / [Verse 1] 8 lines / [Pre-Chorus] 3 to 4 / [Chorus] 4 / [Verse 2] 8 /
  [Pre-Chorus] / [Chorus] / [Instrumental or solo] / [Bridge] 4 / [Final Chorus] / [Outro]. Even with placeholder words, the sequence of tags is a
  map of the song's energy and dynamics.

## Tags and lyrics must agree

The instruments, the mood and the voice in the tags must match what the section tags ask for. A female vocal in the tags with "[Verse - deep male
voice]" in the lyrics makes the model pick one at random. A "gentle" style with "[Chorus - screaming]" fights itself.

## Recipes (starting points; change the details, keep the shape)

| Song | Tags (start of the line) | BPM | Key | Length |
|---|---|---|---|---|
| Lo-fi beat, no words | lo-fi hip hop, chill study beat, warm Rhodes, jazzy guitar licks, round sub bass, lazy swung boom-bap drums, vinyl crackle, rain, instrumental, no vocals | 70 to 85 | E minor | 200 to 240 |
| Pop-punk / rock anthem | pop-punk anthem, high-energy, palm-muted power chords, driving live drums with a double-time snare, raspy male lead, gang shouts, no autotune, raw and loud | 150 to 175 | E major or E minor | 180 to 240 |
| Garage / alt rock | gritty garage rock, fuzzy riffs, stomping drums, thick bass, raspy female lead, shouted backing vocals, raw human voice | 120 to 135 | E minor | 200 to 260 |
| 90s R&B slow jam | smooth 90s R&B slow jam, sultry, warm electric piano, silky clean guitar, deep round bass, swung drums with finger snaps, soulful female lead, stacked harmonies, no autotune | 65 to 80 | E minor or C# minor | 220 to 280 |
| Modern R&B | alternative R&B, tender late-night, airy reverb guitar, warm Rhodes, 808 bass, half-time drums with soft hi-hat rolls, silky male falsetto lead | 65 to 75 | E minor | 220 to 280 |
| Synthwave | retro synthwave, driving, pulsing arpeggiated analog synths, shimmering pads, gated reverb drums, octave synth bass, airy female lead | 100 to 118 | E minor | 200 to 260 |
| Bossa nova | bossa nova, sunny morning, nylon-string guitar, brushed drums, upright bass, light flute, soft breathy lead | 110 to 130 | E minor or G major | 180 to 240 |
| Afrobeats | afrobeats with log drums, joyful, syncopated percussion, shakers, marimba, plucked guitar, warm male lead, female chant | 100 to 115 | E minor | 200 to 240 |
| Disco funk | funky nu-disco, slap bass, choppy funk guitar, brass stabs, four-on-the-floor drums, confident male lead, gang vocal hooks | 112 to 124 | E minor or A minor | 200 to 260 |
| Dream pop / ballad | dream pop, hazy, shimmering reverb guitars, soft pads, slow tempo, ethereal female lead | 70 to 90 | E minor | 220 to 280 |

## Style LoRAs (only on the user's own ComfyUI; Comfy Cloud has none)

Trained on the XL: one at a time, strength 1.0. Each needs its **trigger word placed in the tags** to activate. Pick the one that matches the song's
genre, or none:

| Genre | LoRA | Trigger word |
|---|---|---|
| lo-fi | lo_fi | roti-l0f1y |
| jazz | jazz | roti-j4zzz |
| pop | pop | roti-p0pp4 |
| indie (pop, folk, rock) | indie | roti-1nd33 |
| acoustic, folk, singer-songwriter | acoustic | roti-4custic |
| dream pop | dream_pop | roti-drmp0p |
| electropop, synth pop | electropop | roti-3l3ktrp0p |
| j-pop | j_pop | roti-jp0pp |
| experimental, sound design | experimental | roti-3xpr1mtl |

Rock, R&B, synthwave, bossa nova, afrobeats and funk have no LoRA: leave it off.
