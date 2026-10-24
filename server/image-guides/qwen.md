---
models: [qwen-image-3.0-pro, qwen-2.1, qwen-2.1-turbo]
maker: Alibaba Qwen
sources:
  - https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide (Model Studio edit guide: qwen-image-3.0-pro, 3.0, 2.1-pro, 2.1-turbo; image numbering, roles, depth-map wording)
  - https://huggingface.co/Qwen/Qwen-Image-Edit-2511 (open-weights Qwen-Image-Edit-2511 card: multi-image, identity consistency; no prompt syntax)
  - workflows/image/prompts/qwen-2.1-edit.md (the app's copy of the Qwen 2.1 edit prompt-enhancer brief: <imageN> tags, keep-vs-change, quoted text)
---
# Qwen Image: how to prompt it

## How it reads a prompt
Plain natural language, English or Chinese (other languages not guaranteed). Long, detailed prompts work; the docs give no length limit. State requirements affirmatively. Text to be drawn goes in double quotes, exact characters, with its style (font feel, colour, material) and place. 3.0 Pro is the strongest at text in pictures. Qwen 2.1 has no negative prompt: say what you want, never what to avoid.

## Pointing at the pictures
- Pictures are numbered by their order in the request. Write "image 1", "image 2" (Router, 3.0 Pro) or `<image1>`, `<image2>` (open-weights 2.1 edit; the server fills these in from @names). With one picture only, say "the image".
- Order matters ("image 1 onto image 2" differs from the reverse). Give every picture a role in one clause: which is the canvas that keeps its composition, which supplies a person, a style, a map.
- Describe each picture separately; never say "images 1 to 3".
- Qwen 3.0 Pro takes 1 to 3 pictures only. Send: the frame first, then the character sheet(s) of the most important people, then one map (the colour ID if the sheet is plain grey clay, else depth). Drop style references and extra maps first. Qwen 2.1 takes up to 10: send all.
- Point at a picture for identity instead of describing a face in words (the brief: verbal description makes the model regenerate and lose the likeness).

## Editing from a picture, keeping its layout
Lead with the operation, then what stays. The brief's rule: change exactly what was named, strongly, and hold everything else; name untouched content by role and position, not by looks. Docs wording for a map: "Generate an image that matches the depth map in image 1 and follows this description: ...". Name the medium/style of the result outright, or the clay's look leaks through.

## Style and look
Name the style once, concretely (artist, medium, era), and say how lighting, palette and shadows read. For a whole-picture restyle say that every surface is redrawn in that style, not just tinted. The docs give no list of style words.

## Don'ts
- No "image A", "the first image", "Bild 1" mixes; one numbering scheme only.
- No negative phrasing ("no, without") on 2.1.
- Don't describe resolution or aspect ratio in the prompt.
- Don't invent text: quote only words the user gave.
- Don't repaint preserved things in detail; it makes them drift.

## For Toaster: a clay blockout into a finished picture
Template, one paragraph: [operation: turn image 1, a clay blockout, into a finished <style> picture of <scene>]. [Roles: image 1 fixes camera, layout and forms; image 2 is the colour map saying which flat colour is which thing; <name> in image N is the person]. [The look: light, palette, mood, style]. [What each thing is, in the clay's positions]. [Strength words: low keeps clay colours; middle uses real materials, colours only identify; high keeps only layout and forms]. Close with what stays: the camera, placements and proportions.

Example, Qwen 3.0 Pro, strength 60% (three pictures sent: frame, @giorno, @colour-id; depth left out because the frame already carries the layout):
Redraw image 1, a plain grey clay blockout of an executive office, as a finished anime illustration in the style of Hirohiko Araki's JoJo's Bizarre Adventure, dimly lit with a fireplace and dramatic shadows. Keep the camera, the layout and the proportions of image 1 exactly. Image 2 is the colour map of the same view: each flat colour marks one kind of thing (use it only to tell which object is which; the final colours are free). Image 3 is the character sheet of Giorno: the man sitting behind the desk is Giorno, keeping his face, hair and outfit from image 3. Give the room real materials: dark polished wood desk with a brass desk lamp and a desk phone on it, two tall bookcases full of books, a framed picture on the wall, two monstera plants, three leather armchairs, a stone fireplace burning on the far wall with warm orange light cutting hard shadows across the floor. Heavy ink lines, bold hatching and saturated colour blocking.
