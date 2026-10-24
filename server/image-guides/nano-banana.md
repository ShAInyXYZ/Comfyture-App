---
models: [gemini-nano-banana-2.1, gemini-3-pro-image]
maker: Google
sources:
  - https://ai.google.dev/gemini-api/docs/image-generation (Gemini API docs, templates use Nano Banana 2.1; lists 2.1, 2, 2 Lite, Pro; read only in part)
  - https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana (Google Cloud guide, covers Nano Banana 2 = Gemini 3.1 Flash Image and Nano Banana Pro)
  - https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/ (7 tips, Nano Banana Pro = Gemini 3 Pro Image)
---
# Nano Banana (2.1 and Pro): how to prompt it

## How it reads a prompt
Natural language, narrative: "A simple list of keywords won't cut it; you need to describe the scene narratively." Be specific on subject, lighting, composition. Start with a strong verb naming the main operation. No ideal length is documented. Text-to-image formula: subject + action + location/context + composition + style. Pro uses extended reasoning for complex instructions; 2.1 has a thinking level setting. Order inside the prompt is not documented as mattering.

## Pointing at the pictures
Formula: [reference images] + [relationship instruction] + [new scenario]. Example: "Using the attached napkin sketch as the structure and the attached fabric sample as the texture, transform this into a high-fidelity 3D armchair render. Place it in a sun-drenched, minimalist living room." Give each image a specific role: "Use Image A for the character's pose, Image B for the art style, and Image C for the background environment." Up to 14 images in a request. Per-kind limits in the API docs (garbled table, verify): objects 10 on 2.1 and 6 on Pro; characters 5 on 2.1; style references 3, Pro. The docs say nothing about depth or segmentation maps; state the role of each in words. Whether image order matters is not stated (examples vary).

## Editing from a picture, keeping its layout
"Your prompt needs to focus on what is changing and what is staying the same." Be direct and specific; "Be explicit about what to keep exactly the same." Documented template: "Keep everything else in the image exactly the same, preserving the original style, lighting, and composition." The model "will match the original image's style, lighting, and perspective." Style transfer: "recreate its exact content in a different artistic style." Characters: references keep resemblance of several people in a group; consistency across edits "may vary". Light versus strong change: no dial; state it in words. Iterating in follow-up turns is the recommended way.

## Style and look
Direct it like a creative director: lighting ("chiaroscuro lighting with harsh, high contrast"), camera ("low-angle shot", "wide-angle lens"), colour grading, materials ("navy blue tweed" not "jacket"). Name the art style or medium plainly in the style slot (e.g. "Van Gogh-style painting", "noir comic art style"). Be specific about visual detail (bold lines, colours, shading) for stylised work.

## Don'ts
Negative phrasing: "Describe what you want, not what you don't want" ("empty street", not "no cars"). Bare keyword lists. Vague edits. Known limits: small text, fine details, complex edits and blends can leave artifacts.

## For Toaster: a clay blockout into a finished picture
Template:
[Verb] a finished [medium] image using @frame as the structure. Keep the layout, proportions, perspective and camera of @frame exactly. @colour-id: role. @depth: role. @ref: who. Scene in one narrative sentence. Style and light in plain words. Keep everything else exactly the same as the layout.

Example (strength 60%):
"Transform the clay blockout @frame into a finished anime illustration, keeping its layout, proportions, perspective and camera exactly the same. Use @colour-id only as a key to which flat colour is which kind of object, and @depth as the distance map (white near, black far) for scale and perspective; do not copy the key's colours. Use @giorno, a character sheet, for the man seated behind the desk: keep his face, hair and clothes as on the sheet. The scene is a dimly lit executive office with a crackling fireplace: a desk lamp and a desk phone on the desk, two bookcases, a framed picture on the wall, two monstera plants and three armchairs, each in real materials (leather, polished wood, brass). Lighting is dramatic with long, heavy shadows and warm firelight. Style: anime in the manner of JoJo's Bizarre Adventure by Hirohiko Araki, bold ink outlines, rich saturated colour."
