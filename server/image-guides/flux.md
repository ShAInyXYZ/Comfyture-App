---
models: [flux-2-pro, flux-3-image, flux3-klein]
maker: Black Forest Labs
sources:
  - https://docs.bfl.ml/guides/prompting_unified_building.md (FLUX 3 Image: structure, length, what to avoid)
  - https://docs.bfl.ml/guides/prompting_editing_multi_reference.md (FLUX 3 Image: image 1/2 roles, order, keep-unchanged)
  - https://docs.bfl.ml/guides/prompting_editing_single_reference.md (FLUX 3 Image: keep clauses, restyling, light vs strong)
  - https://docs.bfl.ml/guides/prompting_unified_style.md (FLUX 3 Image, notes on FLUX.2 [klein]: style, light, hex colours)
  - https://docs.bfl.ml/flux_3/flux3_image_klein.md (FLUX 3 Klein: needs the prompt upsampler, refs by order)
  - https://docs.bfl.ml/guides/prompting_guide_flux2 (FLUX.2 pro/max: Subject+Action+Style+Context, lengths, JSON, no negatives)
  - docs.bfl.ml/guides/usecases_editing_style_transfer.md, ..._drawing_rendering.md (FLUX.2 editing)
  - workflows/image/prompts/flux3-klein-edit.md (app copy of Klein's upsampler brief)
---
# FLUX: how to prompt it

## How it reads a prompt
Plain descriptive English, full sentences. "A clear structure matters more than length": lead with the image type and medium/style, then subject, setting, light, framing. Put what matters most first (FLUX.2: subject, action, style, context). FLUX.2 lengths: 30-80 words for most work, 80+ for complex scenes. Name the style early and concretely. Name the light source and what it does. Use one or two strong effects, not many. JSON prompts are documented only for FLUX.2, not FLUX 3: use prose. Klein: its docs say never run it without the upsampler; it was trained on long scene captions.

## Pointing at the pictures
FLUX 3 / FLUX.2 on the Router: "image 1", "image 2" by send order (the server turns @names into these). Up to 10 inputs (FLUX.2 Pro here: 9). Give every picture a role and say how pieces relate: subject, product, setting, style. Base/setting picture first; with auto aspect the output takes image 1's shape. Docs don't treat depth or ID maps as control inputs: they are just pictures, so say what each is for.
Klein (open weights): @name becomes "<ref_image_N>", counted from 0 (frame = 0). Its upsampler calls them "the first image", "the second image". Pair the ordinal with the @name once.

## Editing from a picture, keeping its layout
Write an instruction, name the target exactly, say what changes and list what stays: "Keep the composition, camera framing, pose and layout exactly unchanged." List the elements to keep, not only "the rest". Restyle: "Turn the image into ...; keep the proportions and layout exactly as in the picture." Drawing to render: "Turn the drawing into a realistic photograph", add real materials and lighting for a stronger change. A short plain instruction is a light change; naming new materials, surfaces and lighting is a strong one. Identity: "the woman in image 2", and state what keeps; no further recipe in the docs.

## Style and look
Name the medium and its traits (flat colour, linework, painted texture). Art-style and mood tags may close the prompt (documented for Klein). A hard-to-describe style is better sent as a picture: "in the style of image 4". Exact colours: hex code tied to a named object.

## Don'ts
No negative prompts (FLUX.2 does not support them): say what is present. No "masterpiece", "highly detailed", "ultrarealistic". No vague labels ("vintage", "aesthetic"), no vague instructions ("combine these images", "make them wear it"). Don't open with the environment: it pulls the shot back.

## For Toaster: a clay blockout into a finished picture
Template: [Edit/transform sentence naming @frame as the canvas and what stays: layout, camera, forms, positions]. [Look and medium, first.] [Each kind of thing in the room, in its own words, with its colour/material.] [Who is who: person from their sheet.] [What the maps are for.] [Light.] [Strength: below 50% keep the clay's colours; 50-80% real materials, clay colours only say which is which; above that only layout and forms stay.]
Example (strength 60%, sent: @frame, @colour-id, @depth, @crumpet):
"Turn @frame, a grey clay blockout of a workshop, into a finished still from a warm 3D animated film. Keep the camera, composition, and the position and size of every object exactly as in @frame. Use @colour-id only to tell which object is which (flat colours: workbench, desk lamp, jar, pegboard, shelves, stool, window; do not paint those colours), and @depth for distance: near is white, far is black. At the workbench stands the character from @crumpet, a baby beaver, keeping his face, fur and outfit from the sheet. Replace the clay with real materials: a sturdy oak workbench, a brass desk lamp, a glass jar of nails, a pegboard of hand tools, pine shelves of jars and offcuts, a three-legged stool. Warm afternoon light pours through the window, catching the sawdust in the air, with soft shadows."
