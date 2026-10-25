---
models: [uni-1]
maker: Luma
sources:
  - https://lumalabs.ai/learning-hub/luma-uni-1-model (Luma's official Uni-1 start guide: Create and Modify modes, reference labels and roles, length, what to avoid; Uni-1)
  - https://docs.comfy.org/tutorials/partner-nodes/luma/luma-uni-1/workflow (ComfyUI docs repeating the IMAGE1 pattern; Uni-1)
  - https://docs.agents.lumalabs.ai/guides/faq (Luma API: POST /v1/generations, uni-1 and uni-1-max)
---
# Luma Uni-1: how to prompt it

## How it reads a prompt
- Precise, specific wording beats general wording: camera, lens, light, named aesthetics ("Golden hour, 85mm lens, shallow depth of field").
- Lengths from Luma: reference-guided 100-300 words, edit ("Modify") 30-100 words, hard limit 6,000 characters.
- It responds best to named styles (a film poster style, a painting movement, an artist) over broad adjectives.

## Pointing at the pictures
- Luma's own guide labels references IMAGE1, IMAGE2... and says to give each a role: "Use IMAGE1 (description) as a CHARACTER reference." Roles listed: style, character, composition, color palette, lighting, texture, mood. Unlabelled references are often ignored; without a role the model guesses.
- Closing line for several references: each reference controls only its assigned layer.
- In this app no positional tag is sent: "@frame" arrives as "frame", "@colour-id" as "colour id", "@crumpet" as "crumpet". The docs do not say how the numbers map to the order of pictures, so do NOT write IMAGE1 or "reference image" (Luma turns down such words here). Instead name each input by its plain name AND say what it is, once: "the frame (grey clay blockout)", "the depth map", "the colour id map", "crumpet (the character sheet)".
- Use those same names every time, and write each as a phrase the model can read ("crumpet's character sheet").

## Editing from a picture, keeping its layout
- Modify mode: say what changes and what stays: "Keep the layout, camera and positions of the frame unchanged; change the surfaces to ...". Aspect ratio follows the source in Modify mode (documented).
- Name the elements affected (light direction, shadows, materials).
- If part is ignored: remove conflicting instructions or split into steps.

## Style and look
- Name the aesthetic and the artist; add light and palette in a few concrete words.
- Style references: one role each ("use mood as a style and colour palette reference only").

## Don'ts
- No vague praise ("beautiful", "amazing"), no redundancy, no conflicting instructions.
- Don't use IMAGE1-style labels or "the reference image" (not sent as tags here).
- Don't leave an input without a role.
- Not stated by the docs: negative prompts; avoid "no X" lists.

## For Toaster: a clay blockout into a finished picture
Template:
1. "Render the frame (a grey clay blockout) as <look>, keeping its layout, camera and object positions."
2. Scene in two or three plain sentences.
3. Character: "<name> (the character sheet) is <where>; keep the face and outfit."
4. Maps: "The depth map and the colour id map only guide layout; they must not show."
5. Closing: each input controls only its own role.

Example (strength 60%):
Render the frame (a grey clay blockout) as a cosy woodworking workshop in the style of a warm 3D animated film, keeping its layout, camera and object positions unchanged. Use crumpet (the character sheet) as the CHARACTER reference: Crumpet, a baby beaver, stands at the workbench, keeping his face, fur and outfit. Use the depth map (white near, black far) and the colour id map (each kind of object has one flat colour) only to place and separate objects: a desk lamp and a jar of nails on the bench, a pegboard of tools, two shelves, a stool, a window. Warm afternoon light, soft shadows, sawdust in the air. The clay becomes oak, pine, brass and glass. Each input controls only its own role; no grey clay or flat map colours show in the result.
