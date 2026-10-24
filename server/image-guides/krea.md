---
models: [krea2-turbo]
maker: Krea
sources:
  - https://www.krea.ai/index/krea-2-deep-dive-walkthrough (Krea 2 in general: exploring, style references, moodboards; never mentions Turbo)
  - https://fal.ai/learn/tools/krea-2-prompting-guide (third party, not read in full)
  - workflows/image/prompts/krea2.md (app copy of the enhancer brief) and workflows/image/models.json (krea2-turbo templates)
---
# Krea 2: how to prompt it

## How it reads a prompt
Krea's own page gives no length rule and no template. Its examples are short: a subject, a comma, then a style or mood phrase ("a cat riding a bicycle, retro cartoon illustration"). It advises starting loose, looking at two or three results, then narrowing. The app's enhancer brief (from the model's template) wants one plain-prose paragraph: subjects grouped with their own attributes and actions, grounded phrasing for poses and layout, no lists, JSON or headings. No JSON or word-order guidance exists. The brief says: keep the user's medium ("photo of", "illustration of"), do not invent props or details, polish rather than expand a detailed prompt, and end with "Absolutely no text, no typography, no letters, no words, no numbers, no logos, no watermark, no captions, pure imagery only." unless words to render are given in quotes. The text encoder here is short (512 tokens), so keep to one paragraph.

## Pointing at the pictures
Krea 2 takes style references: an image whose colour, texture, composition cues and painted or photographic feel are applied to the new picture. Krea's tool allows up to four, each with a strength (about 20% a hint, 50% balanced, 80% dominant, may recolour the subject). In this app the style template takes at most 2 references and the server writes @name as "the reference". Describe the content in the prompt; the look comes from the picture. The docs say nothing about depth, colour-ID or layout maps.

## Editing from a picture, keeping its layout
Not documented. Krea 2 has no edit mode here, only style transfer, and Krea notes a strong style can override the subject. The docs give no phrasing for keeping composition, pose or camera.

## Style and look
Name the medium and mood after the subject ("..., dreamy cinematic scene"). Stacking two or three style references is where Krea finds the most interesting results. Moodboards and "avoids" exist in Krea's app but are not part of this template.

## Don'ts
Don't ask for rendered text (the brief forbids it). Don't push style strength so high that it eats the subject. Don't add objects the user didn't imply. Docs list no other mistakes.

## For Toaster: a clay blockout into a finished picture
Toaster cannot use Krea 2 for clay renders: its templates are text-to-image and style reference only, so the clay frame, maps and character sheets cannot be sent as the canvas. Use FLUX 3 Klein or another edit model.
If Krea is used for a plain picture anyway, write one paragraph: subject and setting first, the medium, the light, and the style phrase last. Style-reference template: describe only the content ("a dimly lit executive office with a fireplace, a man behind a desk, bookcases, armchairs, monstera plants") and let "the reference" carry the look; do not describe the reference's style in words that fight it.
