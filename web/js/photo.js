const MAX_SIDE = 2048;

/**
 * Re-encodes a dropped or pasted image as a JPEG of at most 2048 px, with
 * its camera rotation applied, so the server always gets an upright photo.
 */
export async function normalize(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("That isn't an image.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

/** The first image file in a drop or paste event, if any. */
export function imageFrom(dataTransfer) {
  for (const item of dataTransfer?.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
