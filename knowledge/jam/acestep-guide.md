# Writing a song for ACE-Step 1.5 XL (Pickle's guide)

Sources: the ACE-Step 1.5 Tutorial and Musician's Guide (github.com/ace-step/ACE-Step-1.5/docs/en), deAPI's prompting guide, and the
owner's own AceStep1.5XL-Superior workflow, whose settings are the defaults. Where the sources differ, the owner's practice wins
(what each source says and how the differences were settled: docs/research/acestep-prompting.md).

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
- **Quality:** Full is the XL in three passes (the first from nothing, two light refinements). The owner runs the first pass at **cfg 3 and 50 steps** and
  the enhancer at 0.75 (OtiaFlow's overrides on the Superior graph). Draft is the first pass alone, for trying an idea.
- **Roll more than one take.** A new seed gives a new performance of the same words; the owner makes three to five of one idea and picks by ear.

## The style: a paragraph, not a tag list

The owner's own pipeline (OtiaFlow, flow "ACE STEP 1.5xl Music Generation", the songs they rate far above anything made from tag lists) writes the style as
**one dense prose paragraph of about 1,500 to 2,000 characters**, which the XL reads well. deAPI's "keywords, not prose" is for the small models; here the
owner's practice wins. Five layers, in this order, each concrete and sensory:

1. **The genre and its primary harmonic instrument**, with the instrument's chord character or playing style ("anchored by mournful cellos and a delicate
   plucked harp performing sparse, open-fifth Phrygian dominant chord progressions").
2. **The rhythm section's feel**: how the drums and bass groove (ghost notes, swing, pocket, "cavernous timpani rolls and booming taiko drums struck with heavy
   felt mallets"), not just that they exist.
3. **The lead vocal's identity**: gender, register, how the voice moves (chest to falsetto), its technique (runs, bends, legato, vibrato); "no autotune, raw human
   voice" when it should sound human. For an instrumental, leave this out and expand the arrangement instead.
4. **Arrangement events placed in named sections**: every distinctive instrument or textural event is tied to a section ("intricate pizzicato strings trace the
   melody during the first verse", "a towering choral harmony stack fills out the chorus", "a weeping cello cadenza closes the outro").
5. **Production and sonic texture**: the overall finish (analog, lo-fi, polished, cathedral reverb, pristine high end, crushing low end).

Rules: no artist names, no lyrics, never the BPM, the key or the time signature (they are fields; written in the style they conflict). No empty adjectives
("beautiful", "amazing", "epic"): say what is heard. Fill what the idea leaves out with choices that fit its genre and mood. One primary genre, a second only as
a fusion. For a song without words, say "instrumental" and describe the arrangement.

(A short comma line of 10 to 18 descriptors, genre first, is the fallback for a quick draft: it works, but it sounds generic next to the paragraph.)

## Lyrics: the structure with direction lines

- **Layout:** each section tag on its own line in square brackets, lowercase, a blank line between sections: [intro], [verse], [pre-chorus], [chorus], [bridge],
  [inst], [outro] ([verse 2] is fine). Meta brackets may open the song: [STYLE: …] and [MOOD: two to four words].
- **Instrumental stretches are written as direction lines**, one bracket per event, in CAPS, in performance order, naming instruments and texture as they
  enter and leave: `[SOLEMN CHURCH ORGAN AND DEEP CELLOS BEGIN A SLOW, MOURNFUL SONATA]`, `[A LONE VIOLIN SWELLS, ECHOING OVER DESOLATE RUINS]`. An intro, an
  instrumental break and an outro each get two or three. A whole instrumental is six to twelve of them telling a beginning, a peak and an end. Never a tempo or
  key bracket.
- **Sung lines are short**, 6 to 10 syllables (a rap tighter), the same length in the same place of each verse; one concrete image a line, a real emotional
  arc across the verses. A chorus repeats word for word. UPPERCASE a shouted word; (parentheses) for backing vocals; vowel stretches sparingly.
- **In the language the idea asks for** (Latin, Norwegian, Japanese, French in the owner's own runs): the words straight in that language, never transliterated,
  no stray characters from another; the tags and the direction lines stay in English.
- **Count:** about one sung line every 4 to 5 seconds; a long song is filled with direction-line sections, never padded with verses. A section tag with no words
  under it is silence: write [inst] with direction lines on purpose.
- **Shape of a full song:** [intro] (direction lines) / [verse] / [pre-chorus] / [chorus] / [verse] / [chorus] / [inst] (direction lines) / [bridge] / [chorus] / [outro]
  (direction lines). The user can steer one generation with a line of their own ("full inst and chorus only").
- **The owner's other form, for a sung song:** capitalised section tags with the arrangement after an em dash where it changes, the sung sections plain:
  `[Intro — low cellos and slow timpani roll, distant choir humming, single bell toll]`, `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Instrumental Bridge — mournful
  cello solo over swelling strings, choir rises in layered harmonies]`, `[Final Chorus — full orchestra enters, soprano soars above choir]`, `[Outro — solo piano
  traces a slow melody, lone soprano dissolves into silence]`. An instrument named in a tag must be one the style paragraph gave that section.
- **Only the language asked for:** a writer sometimes drops a stray character of another script into the words ("Les周三 soirs" in a French song): never let one
  through. (The owner's pipeline strips CJK characters from non-CJK lyrics.)
- Avoid the cliches that mark a song as generated: neon, moonlight, hold on tight, burning flame, falling apart.

## The style and the lyrics must agree

The instruments, the mood and the voice in the style paragraph must match what the sections and direction lines ask for. A female vocal in the tags with "[Verse - deep male
voice]" in the lyrics makes the model pick one at random. A "gentle" style with "[Chorus - screaming]" fights itself.

## Recipes (starting points for a quick draft's tag line; a real song gets the paragraph)

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

Trained on the XL (synthetic tracks, 12 to 15 each): one at a time, at the strength their documentation gives, **1.0**. Each is used by putting its **trigger
word first in the caption**, `<trigger>, <description>, <tags>`, and the server does that: never write it. **A LoRA is for a beat or a song with no words.** In our test
the same Japanese song was clearly sung without the LoRA (413 words heard, 40 of 41 lines) and unintelligible with the j_pop LoRA loaded (99 words, 13 of 41). So never
choose one for a song whose words must be heard. Pick the one that matches the genre, or none:

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
