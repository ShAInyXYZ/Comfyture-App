import {registerRoot, staticFile, delayRender, continueRender} from 'remotion';
import {Root} from './Root';

// Comfyture's own fonts, served from public/fonts.
const faces: [string, string, string][] = [
  ['Manrope', 'fonts/manrope-400-800.woff2', '400 800'],
  ['IBM Plex Mono', 'fonts/ibm-plex-mono-500.woff2', '500'],
  ['IBM Plex Mono', 'fonts/ibm-plex-mono-600.woff2', '600'],
  ['Comfyture Lyric', 'fonts/comfyture-lyric.ttf', '400'],
];
const handle = delayRender('fonts');
Promise.all(
  faces.map(([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile(file)}) format("${file.endsWith('.ttf') ? 'truetype' : 'woff2'}")`, {weight});
    (document.fonts as unknown as {add: (f: FontFace) => void}).add(face);
    return face.load();
  }),
)
  .then(() => continueRender(handle))
  .catch((e) => {
    console.error(e);
    continueRender(handle);
  });

registerRoot(Root);
