---
models: [gen4_image]
maker: Runway
sources:
  - https://docs.dev.runwayml.com/guides/using-the-api/ (Runway API guide: referenceImages entries are {uri, tag}; @tag in the prompt; an untagged image is not called out; gen4_image)
  - https://help.runwayml.com/hc/en-us/articles/40042718905875-Gen-4-Image-References-Guide (official References guide: up to 3 references, @ names a reference in the app; gen4_image; page would not load in full, known via search summary)
  - https://help.runwayml.com/hc/en-us/articles/37053594806419-Creating-with-Frames (official: 1000-character prompt, simple prompts work, detail gives control; Gen-4 Image)
  - https://www.krea.ai/docs/api-reference/image/runway-gen-4-image.md (third party: tags 3-16 chars, lowercase letters/digits/underscore, start with a letter)
---
# Runway Gen-4 Image: how to prompt it

## How it reads a prompt
- Prompt limit 1,000 characters (the app cuts at 1,000): short and dense, one idea per clause.
- Runway says simple prompts work and detail adds control: start with the subject and scene, then add look and light.
- The official Gen-4 Image Prompting Guide did not load, so no further official rules are confirmed.

## Pointing at the pictures
- Runway's API names a reference with a `tag` and the prompt cites it as @tag ("@EiffelTower painted in the style of @StarryNight"). An untagged image is not called out in the prompt; it just supplies general influence (such as style).
- This app sends only `uri`, no tag. So @tag cannot work here, and "image 1" is NOT a documented way to name a reference. It is unconfirmed whether "image 1" is understood.
- Safest: describe each picture by what it is, in words, and add its number only as a hint: "the character from image 2", "the room layout from image 1". Never rely on the number alone.
- Only 3 pictures go, in this order: (1) the frame, (2) the character sheet(s), (3) one map. Pick the map: @depth if the room's depth matters; @colour-id if objects get confused. Drop other maps and extra style references; the writer must not mention pictures that are not sent.

## Editing from a picture, keeping its layout
- Not stated for gen4_image: it is a reference-based generator, not a documented editor. Layout comes only from how well the prompt and the frame agree.
- So describe the layout in words too (what stands where), and say "same camera angle and composition as image 1".
- Say the third map is only guidance.

## Style and look
- Runway's face-keeping works from clear, evenly lit, neutral references; a front character sheet is right.
- State the look once, concretely: medium, artist, light.

## Don'ts
- Don't write @names the server leaves behind; don't exceed 1,000 characters.
- Don't list more than 3 pictures or lean on a fourth.
- Don't use negative lists; describe what you want.
- Don't promise exact object counts at length; list objects briefly.

## For Toaster: a clay blockout into a finished picture
Template: "<look> picture with the same composition as <frame>. <Who> from <sheet>, <where>. <Objects>. <Light, palette>. <Third picture> is only a depth/colour guide." Under 900 characters.

Example (strength 60%):
Anime illustration in the style of Hirohiko Araki's JoJo's Bizarre Adventure, same camera and composition as image 1 (the grey clay blockout). Giorno, the character from image 2, sits behind a desk with his face, hair and outfit kept. Dimly lit executive office: fireplace, desk lamp and desk phone on the desk, two bookcases, a picture frame, two monstera plants, three armchairs, as placed in image 1. Dramatic shadows, warm firelight, bold ink lines. Image 3 is a depth map (white near, black far) used only for placement. Real wood, leather and leaves, no grey clay.
