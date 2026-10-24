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
An anime illustration in the style of Hirohiko Araki's JoJo's Bizarre Adventure of a dimly lit executive office. In the centre, a young man with a golden braided hairstyle in a pink suit, Giorno, sits behind a large dark wood desk, one hand resting on it. On the desk stand a brass desk lamp casting a warm pool of light and a black desk phone. Against the left and right walls rise two tall bookcases full of leather books; between them a framed picture hangs on the back wall. A stone fireplace on the far wall burns orange, throwing long dramatic shadows across the floor. Two monstera plants with large split leaves stand in the left and right corners, and three leather armchairs are arranged in the foreground and at the sides. Heavy ink outlines, hatched shading, saturated deep reds, ochres and teal shadows, a low camera angle looking slightly up at the desk.
