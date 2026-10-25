---
models: [kling-image-o1]
maker: Kling
sources:
  - https://apidoc.cometapi.com/api/image/kling/omni-image.md (third-party mirror of the Kling Omni Image API: <<<image_N>>> syntax, 2,500-char prompt, image_list rules; Kling O1 / Omni image)
  - https://kling.ai/document-api/apiReference/model/OmniImage (Kling's official API page; would not load, so unconfirmed)
  - https://www.krea.ai/models/kling-o1 (third party: up to 10 tagged references, detailed prompts work best)
---
# Kling Image O1: how to prompt it

No official Kling prompt guide was found. Everything below is from the API schema (via a mirror) plus general practice; "not stated" means the docs are silent.

## How it reads a prompt
- Plain natural-language sentences. Prompt limit 2,500 characters (the app cuts at 2,500).
- Docs advise naming subject, style, composition, lighting, camera angle, mood and constraints (Krea, third party).
- Cinematic wording (lens, light, atmosphere) suits it. No documented weighting or negative-prompt field is sent.

## Pointing at the pictures
- The prompt cites pictures as <<<image_1>>>, <<<image_2>>>, in the order of image_list. Each placeholder must match a sent picture; never cite a missing index.
- The server turns each @name into its <<<image_N>>>. Write "@frame" where you would say "the first picture"; do not also write "image 1" yourself.
- Official pattern: "Using <<<image_1>>> as a visual reference, generate ...". Not stated: any role vocabulary, so give each picture one plain role in a sentence ("<<<image_3>>> is the character").
- Order sent: frame, maps, references. Up to 10 pictures.

## Editing from a picture, keeping its layout
- Not stated in the docs. Practical: open with the frame as the base: "Keep the exact layout, camera and object positions of @frame; re-render it as ...".
- Say what the maps are in one clause each: "@depth is a depth map (white near, black far), @colour-id marks which object is which." Say they guide only layout, and must not show in the result.

## Style and look
- Put the look in words: medium, named artist or film style, light, palette. One look, stated once.
- Style references (e.g. @mood): say "take only the colour and mood of @mood".

## Don'ts
- Don't exceed 2,500 characters; don't leave a placeholder without a picture.
- Don't write @names for pictures that were not sent.
- Don't stack contradicting looks, or ask for the grey clay, flat colours or map textures to stay.
- Don't use vague praise ("beautiful, amazing").

## For Toaster: a clay blockout into a finished picture
Template:
1. "Re-render @frame as <look>, keeping its exact layout and camera."
2. What it is and where, using the scene facts.
3. Who: "<name> from @sheet" with one line of looks.
4. Maps: one clause each, guide only.
5. Strength: low keep the clay's colours; mid real materials (colours only tell which is which); high only layout and forms stay.

Example (strength 60%):
Re-render @frame as a cosy woodworking workshop in the style of a warm 3D animated film, keeping its exact layout and camera. Crumpet, the baby beaver in @crumpet, stands at the workbench planing a plank; keep his face, fur and outfit from the sheet. A desk lamp and a jar of nails sit on the bench, a pegboard of tools hangs on the back wall, two shelves of jars and offcuts line the side, a stool stands by the bench and a window lets in the afternoon sun. Warm golden light, soft shadows, sawdust glowing in the air. @depth is a depth map (white near, black far) and @colour-id shows which object is which; use them only for layout and depth. The grey clay surfaces become real materials: oak, pine, brass, glass. No clay, no flat colours in the final picture.
