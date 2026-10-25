// A workflow's picture in a grid: its first frame at rest, its animation once it is pointed at or focused. Comfy Cloud's previews are
// animations of up to 4 MB each: the home's storefront alone weighed 7 MB before anyone looked at it.

/** The picture's still: its first frame, cut out of the animation by the server (a picture that does not move comes as it is). */
export const stillOf = (url) => (url ? `${url}${url.includes("?") ? "&" : "?"}still=1` : url);

/** Starts an <img>'s animation (`url`) the first time `on` is pointed at or gets the focus; returns the img. */
export function playsOn(on, img, url) {
  const play = () => {
    if (img.dataset.moving) return;
    img.dataset.moving = "1";
    img.src = url;
  };
  on.addEventListener("pointerenter", play);
  on.addEventListener("focusin", play);
  return img;
}
