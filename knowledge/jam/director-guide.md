# Directing a music video from a song (the audio director's guide)

For the step that reads a finished song (its sections, its lyrics on real times, its beats, its mood), the band and the vibe, and writes the
storyboard. Sources: the arXiv study "Is there a language of music-video clips?" (548 official videos, an editor, a director and a composer
interviewed), the ACE-Step, LTX-2.x and FLUX.2 docs, and AI music-video workflows from Comfy and others (2026). What no source settles is marked
*(our convention)*. The director never rewrites the lyrics, never asks for text in a frame, and gives a reason for every shot.

## The grid

1. A beat is 60 / BPM seconds, a 4/4 bar 240 / BPM. **Every cut lands on a downbeat.** At a climax a cut may lead the downbeat by 1 to 3 frames
   (the editors do: it feels pushed). The cut is the music's rhythm, even where it is not on a beat.
2. Shot length follows the section. Nothing under one beat, or about 1 s.

| Section | Shot length | Cut rate |
|---|---|---|
| Intro, outro, bridge | 4 to 8 bars, one or two shots | slow, poetic: hold |
| Verse | 2 bars (4 for a hero or lip-sync shot) | every 2 beats at most |
| Pre-chorus | steps down 4, 2, 1 bars | accelerating |
| Chorus | 1 to 2 bars | every beat or two |
| Final chorus | mostly 1 bar | the fastest of the song |

   The real average is about 4.5 s a shot: about 45 shots for a 4-minute song.

## The mix

3. By runtime: lip-sync **25% or less**; performance without lip-sync 15% or less; narrative **40% or more**; motif, insert and b-roll 15 to 20%.
   Do not lip-sync because the feature exists. Spend it where the viewer studies the mouth: a chorus hook, a held note, an emotional line.
4. **Section roles.** Intro: wide, set up the world, show the motif, no lip-sync. Verse: medium shots of the story. Chorus: close-ups, the band
   playing, the motif. Bridge: change the palette or the place, the low point, no lip-sync, hold longer. Final chorus: the widest shots and the fastest
   cuts, the payoff. Outro: hold on the motif.

## Lip-sync shots

5. Medium-close or close, **one face**, frontal, 4 to 10 s. They begin on the phrase's onset (trim the lead-in silence; let the face appear
   before the first sung word). Name who sings: with two characters in frame both mouth the words. Use the separated vocals when the mix is dense.
   Skip very fast lines and anything under 2 s. Cover the seams with a cutaway that has no mouth in it.

## The story

6. Write a logline first: who wants what, and what stands in the way. Each verse is one beat of action. The chorus shows the emotional thesis
   through the motif, **not the literal lyric** (a literal illustration looks cheap). The bridge is the reversal or the low point. The final
   chorus is the payoff, the outro the aftermath. One idea per shot.
7. **Motif and palette.** One object plus one gesture, from the song's central image: it must stay recognisable when the place changes, and come
   back in the outro hold. Two colours and a neutral. Fast and major: warm, light, saturated. Slow and minor: cool, dark, desaturated (Western music
   only). The verse is cooler and flatter, the chorus brighter, the grade shifts at the chorus.

## Writing a shot for the video model

8. One paragraph, present tense, under 200 words, action first, then camera, then light and mood, in this order. Begin "Use the provided start
   image as the first frame." Do not describe again what the image shows; say what must stay fixed. One subject action, one camera move. Show
   emotion through physical detail. Avoid text and signs, crowds, contradictory camera moves, and descriptions of the pace of speech.
9. **Identity.** The same identity block and one or two sheet references in every shot. Make each first frame with a multi-reference image-edit model
   ("Image 1 is ..., keep ... , change only ..."), then run image-to-video from it. Chain the last frame into the next only for continuous action;
   otherwise every shot starts from a fresh still conditioned on the references. A video model keeps a face for only a few seconds past its first
   frame, and will lip-sync a mismatched face without keeping it the same person: keep shots short and medium or close. A chorus shot may come back
   in a later chorus, re-graded.
10. **Transitions.** A hard cut on the downbeat by default. A whip pan (its midpoint on the beat) between chorus shots in different places. A
    match cut for a jump in time or place. A dissolve only in the bridge and the outro *(our convention)*. A flash or a speed-up only where the final
    chorus comes in.

## The lyrics layer

11. The words are a layer over the video, never in it. One line to a cue, 42 characters at most, two lines at most; in at or just before the vocal
    onset (not on the beat grid) and out before the next line; at least 5/6 s and at most 7 s on screen; a line that would be read faster than
    20 characters a second is split. Inside the title-safe area in 16:9 (90%); in 9:16 keep about 15% clear at the top, 25 to 35% at the bottom and
    10 to 15% at the sides. Frame faces in the upper two thirds so the lower third is free for the words.

## The answer the director gives

```
{ "title", "logline", "motif", "palette": ["#..", "#..", "#.."], "look": "one line, the grade and the film stock",
  "arc": [{ "section": "Verse 1", "beat": "what happens" }],
  "shots": [{ "from": 10.0, "to": 20.0, "type": "performance | dance | story | broll | abstract | motif",
              "who": ["artist"], "sings": "artist | null", "size": "wide | medium | close | macro", "camera": "...",
              "prompt": "the first frame, present tense", "action": "what moves", "transition": "cut | whip | match | dissolve",
              "lipsync": true, "why": "the chorus hook, on the downbeat" }] }
```

The server never trusts the model's arithmetic: it snaps every shot to the nearest bar, closes gaps, shortens or splits a shot over 10 s, and
turns lip-sync off wherever the line is sung for less than 60% of the shot, the shot is not medium or close, or no one is named to sing it.

## A worked example (96 BPM, major, 240 s: a bar is 2.5 s, 96 bars)

Palette amber and teal. Motif: a hand lantern passed from person to person. Story: a three-piece band carries a dim lantern across a sleeping
town and up a tower; the rain puts it out in the bridge and they relight it together in the final chorus.

| Section (time, bars) | Shots | Types | Lip-sync |
|---|---|---|---|
| Intro 0:00 to 0:10 (4) | 1 of 10 s | a locked wide of the town at blue dusk, one amber lantern in a window | none |
| Verse 1 0:10 to 0:50 (16) | 2 of 10 s, 4 of 5 s | medium story: the singer carries a dim lantern down a cobbled street; hand insert | 1 of 5 s |
| Chorus 1 0:50 to 1:20 (12) | 4 of 5 s, 4 of 2.5 s | close-ups on a rooftop at golden hour, band playing, motif insert, a whip pan | 3 of 5 s |
| Verse 2 1:20 to 2:00 (16) | 2 of 10 s, 4 of 5 s | the lantern handed up the tower stairs, handheld | 1 of 5 s |
| Chorus 2 2:00 to 2:30 (12) | 4 of 5 s, 4 of 2.5 s | the same framings as chorus 1 in a new place | 3 of 5 s |
| Bridge 2:30 to 2:50 (8) | 2 of 10 s | macro of the flame guttering in rain, cold teal, a dissolve | none |
| Final chorus 2:50 to 3:30 (16) | 4 of 5 s, 8 of 2.5 s | a wide orbit on the roof at sunrise, the relit lantern raised, the fastest cuts | 3 of 5 s |
| Outro 3:30 to 4:00 (12) | 20 s and 10 s | the lantern on a windowsill at dawn, mist clearing, a hold | none |

45 shots, 11 of them lip-sync (55 s, 23% of the runtime).
