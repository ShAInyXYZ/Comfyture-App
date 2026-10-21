# Makers' logos

The logo of the maker of the model at the core of a Utensils book (a Library workflow or a Shelf tool) is pressed into its spine. Which maker a book gets is decided by `web/js/utensils-makers.js`.

- `mono/<id>.svg`: one-colour marks, 24x24. Most are from LobeHub's `@lobehub/icons-static-svg` 1.97.0 (MIT, notice below). The marks of makers that set has no logo for (`wan`, `rodin`, `magnific`, `heygen`, `higgsfield`, `beeble`, `hitpaw`, `quiver`, `sonilo`, `hidream`, `kandinsky`) are lettermarks drawn here: the maker's initials in Manrope ExtraBold inside a ring.
- `pressed/<id>.svg` and `web/css/ut-makers.css` are made from them by `node scripts/utensils-makers.mjs`. Run it again after adding a logo.

The logos are the trademarks of their owners. They are shown only to say which model a workflow runs, as ComfyUI's own template cards do.

## LobeHub Icons: MIT License

Copyright (c) LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
