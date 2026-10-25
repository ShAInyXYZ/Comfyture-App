---
models: [z-image-turbo]
maker: Tongyi-MAI
sources:
  - https://huggingface.co/Tongyi-MAI/Z-Image-Turbo (official model card, Z-Image-Turbo: example prompts, guidance 0, 8 steps, bilingual text rendering)
  - workflows/image/prompts/z-image.md (the app's copy of the Z-Image-Turbo prompt-enhancer brief: structure, quoting text, no negatives)
---
# Z-Image Turbo: how to prompt it

Z-Image Turbo here is text-to-image only. It has no image input: it cannot take the clay frame, maps or character sheets, and there is no @name pointing. (The card mentions a separate Z-Image-Edit; the app does not offer it.) If Toaster ever sends it a scene, describe the scene in words only; no layout is kept.

## How it reads a prompt
Natural language. The card's examples are a short comma list ("Astronaut in a jungle, cold color palette, muted colors, detailed, 8k") and a dense descriptive paragraph (clothes, makeup, hair, accessories, lighting, background). The app's brief, written for this model, prefers one plain English paragraph of 80 to 250 words. Turbo runs with guidance 0 and 8 steps; the card says nothing on negative prompts for Turbo (only the base model). So say everything that should be there and nothing to avoid. Renders English and Chinese text well.

## Pointing at the pictures
Not applicable: no reference pictures. Name a character by appearance in words (hair, clothes, build); a name alone gives no likeness.

## Editing from a picture, keeping its layout
Not possible with this model. Fix positions in words: foreground, middle, background, left/right, where the subject sits in the frame.

## Style and look
Give the medium plainly (photograph, 3D render, oil painting, anime illustration). For a photo add shot size, lens feel (35 mm, macro) and depth of field. Say light direction, colour, quality and time of day; main colours and materials. Describe what is present and concrete, not metaphors. The card lists no artist or style keywords; the app's brief omits "masterpiece", "8k", "best quality".

## Don'ts
- No "no", "without", "avoid".
- No quality filler words.
- Text shown in the picture goes in double quotes, exactly as given, with colour, typeface feel and place.
- Don't write @names, "image 1" or ratios.

## For Toaster: a clay blockout into a finished picture
Structure: subject and what it does, where; medium and style; shot/lens; light; colours and materials; composition front to back; text. Turn the scene's facts (what each thing is, where it stands, how many) into the paragraph. The clay's exact framing cannot be kept; strength and maps do not apply.

Example (words only):
A still from a warm 3D animated film of a cosy woodworking workshop. In the centre, Crumpet, a round-cheeked baby beaver with brown fur, stands at a sturdy oak workbench planing a plank, curls of wood falling to the floor. On the bench stand a brass desk lamp casting a warm pool of light and a glass jar of nails. Against the back wall hangs a pegboard full of hand tools; two pine shelves of jars and wood offcuts rise on the left. A window on the right lets in golden afternoon sun, catching the sawdust in the air. A three-legged stool stands in the foreground. Soft global illumination, rounded shapes, warm honey and teal tones, a low camera at the bench's height looking slightly up.
