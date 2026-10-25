---
models: [gpt-image-2.5-flare, gpt-image-2.5-sunburst]
maker: OpenAI
sources:
  - https://developers.openai.com/api/docs/guides/image-prompting (GPT Image 2.5 prompting guide: Flare = small, fast; Sunburst = base, higher quality, precise editing)
  - https://developers.openai.com/api/docs/guides/image-generation (API guide, 2.5 Flare/Sunburst; no stated max of input images)
  - https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide (Cookbook guide for gpt-image-2, marked archived; same advice, older model)
---
# GPT Image 2.5 (Flare, Sunburst): how to prompt it

## How it reads a prompt
Plain prose, labeled sections or tags all work; the docs say no special syntax is needed. No length rule is given (examples run one sentence to a short brief). Order: define the result and its use first, then scene, subject, details, constraints. Break a complex brief into short labeled lines (scene / subject / details / constraints). A chat model rewrites the prompt first. Sunburst suits precise edits; Flare is fast and good for everyday work. The guide says "overloaded prompts" hurt: prefer one clear brief, not piles of tweaks.

## Pointing at the pictures
"Number each input and state its role" (subject, style, clothing, background): "Image 1: ... Image 2: ...". Then say how they combine and what moves where. Max input count is not stated by the docs (examples use up to four); the app allows 16. No control-map guidance exists in the docs; the closest is the sketch example below, so describe each map by its role ("image 3 is a depth map: near is white, far is black; use it only for distances").

## Editing from a picture, keeping its layout
Documented sketch-to-render wording: "Turn this drawing into a photorealistic image. Preserve the exact layout, proportions, and perspective. Choose realistic materials and lighting consistent with the sketch intent. Do not add new elements or text."
Separate "change" from "keep": "Change only X" plus "Keep everything else the same / Do not change anything else." Name what must stay (camera angle, layout, lighting, surrounding objects, saturation, contrast). Repeat the keep list each time. Identity: list the fixed features (face, skin tone, body shape, pose, expression, hairstyle, proportions) and name the one thing allowed to change. Strong versus light change: the docs give no dial; say how far in words ("keep only the layout" vs "keep colours and shapes, change only the materials").

## Style and look
Name the medium, materials, lighting and colours ("watercolor", "3D render", "anime cel"). Ask for photorealism only when you want it. Camera and lens words set the look, not an exact simulation. For style transfer, give the reference only the role of palette, texture or medium and describe the new subject separately. For dark, neon or wide scenes, state scale, atmosphere and colour instead of mood words alone.

## Don'ts
Cinematic lighting or grading when you want realism; stock-photo, clip-art, gradients, heavy retouching; unstated invariants on edits; many changes at once; extra text, logos, watermarks (name them as excluded when they matter). Text and character consistency across images can be unreliable (docs). Not documented: whether negative phrasing hurts.

## For Toaster: a clay blockout into a finished picture
Template:
Use @frame as the canvas. [Intent: finished image from a 3D blockout.] Keep its layout, proportions, perspective and camera exactly; do not move or add objects. @colour-id ... role; @depth ... role; @reference ... who/what it is. Look: [medium, light, colours]. Materials: [what each thing is made of]. Do not add text or watermarks.

Example (strength 60%, middle: real materials, grey only says which is which):
"Make a finished still from a warm 3D animated film from a 3D clay blockout. @frame is the canvas: keep its layout, proportions, perspective and camera exactly, and do not add, move or remove objects. @colour-id marks which kind of thing each flat colour is; use it only to tell objects apart, and do not copy its colours. @depth shows distance, near is white and far is black; respect it for scale and perspective. @crumpet is a character sheet of Crumpet, a baby beaver: he stands at the workbench planing a plank; keep his face, fur and outfit from the sheet. Scene: a cosy woodworking workshop with a desk lamp and a jar of nails on the bench, a pegboard of tools on the back wall, two shelves of jars and offcuts, a stool and a window. Look: warm 3D animation, soft global illumination, rounded shapes, a rich warm palette. Give every clay shape real materials (oak, pine, brass, glass). Do not add text, logos or watermarks."
