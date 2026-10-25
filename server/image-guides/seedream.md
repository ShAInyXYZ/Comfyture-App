---
models: [seedream-5-0-pro-260628, seedream-5-0-flash-260915]
maker: ByteDance
sources:
  - https://docs.byteplus.com/docs/modelark/seedream-4-0-5-0-prompt-guide (BytePlus ModelArk "Seedream 4.0-4.5 prompt guide"; page body could NOT be fetched, only the title; used as a pointer)
  - https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting (Runware, a third-party host: Seedream 5.0 Pro prompting; NOT official)
  - https://seed.bytedance.com/en/seedream4_5 (ByteDance Seed page, Seedream 4.5: multi-image references, keep/change examples, text rendering; no formal guide)
---
# Seedream: how to prompt it

Note: no official Seedream 5 prompt text could be read. What follows is the Seed page for 4.5 plus a third-party 5.0 Pro guide; treat it as good practice, not as ByteDance's rules.

## How it reads a prompt
Natural-language clauses; Runware advises layering them: format, subject, composition, lighting, in-image text, style. Name the format/medium first. Keep under about 600 English words (hard limit 3,000 characters per Runware). A skipped clause is decided by the model. Seedream 5 Flash is the lighter model; the docs read gave no difference in wording.

## Pointing at the pictures
- Up to 10 references on Pro. On the Router, @names become "image 1", "image 2" in the order sent (frame first, then maps, then references).
- Runware prefers naming a reference by what it shows ("the character on the sheet") over its position. Safest here: use both once: "image 3 (the character sheet of Crumpet)".
- Always give each picture a role in the sentence; references without roles are the mistake guides warn about.
- If more than a few pictures: frame first, people next, maps and style last.
- To carry identity or a brand look, rely on the reference, not a prose description of the face. Say "preserve the exact appearance of the person in image 3".

## Editing from a picture, keeping its layout
The Seed 4.5 page's examples state what changes and what stays ("keep the model's pose, change the dress material"). Describe the one change wanted, then pin what must stay by name: camera angle, positions, silhouettes, proportions, backdrop. Unpinned things drift.

## Style and look
Name the style once and echo it in the last clause. Give lighting source, colour and mood concretely. Say the medium outright (illustration, not photograph) so a clay or photo base does not set it. The docs read give no list of style keywords.

## Don'ts
- Don't leave a reference without a role, or an edit without a keep clause.
- Don't exceed ~600 words.
- Don't write resolution or ratio in the prompt.
- Don't quote text you were not given; quote exact copy and its type style when text is wanted.
- Negative prompts: not confirmed; phrase positively.

## For Toaster: a clay blockout into a finished picture
Template: [Format and medium + the look]. [Roles: image 1 = clay layout to keep; image 2 = colour map (which flat colour is which thing, colours not kept); image 3 = character sheet of <name>]. [Scene content in the clay's positions, with real materials]. [Light and palette]. [Keep clause: camera angle, placements, proportions, silhouettes of image 1]. Strength: low keep clay colours; middle real materials; high only layout and forms.

Example, strength 60%, four pictures sent in order: image 1 frame (plain grey clay), image 2 colour ID, image 3 depth, image 4 Crumpet's sheet (Pro takes all; on Flash, if it complains, drop the depth map first):
Still from a warm 3D animated film: a cosy woodworking workshop in the afternoon sun. Image 1 is the clay blockout: keep its camera angle, the placement and proportions of every object and the silhouettes. Image 2 is the colour map: each flat colour marks one kind of object, used only to identify them, not as final colours. Image 3 is the depth map: near is white, far is black; keep that depth order. Image 4 is the character sheet of Crumpet: the baby beaver at the workbench is Crumpet, preserving his face, fur and outfit exactly from image 4. Fill the room with a sturdy oak workbench bearing a brass desk lamp and a jar of nails, a pegboard of tools, two pine shelves of jars and offcuts, a stool and a window glowing with warm light. Soft global illumination, rounded shapes, warm golden palette, gentle shadows.
