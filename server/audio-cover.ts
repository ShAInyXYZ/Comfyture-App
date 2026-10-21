// A song's cover: the picture that is its thumbnail (the record's label, the sleeve on the shelf) and the video cover, a few seconds
// of a character performing a part of it. Both are the app's own media (a picture kept under /media/photos, a clip kept under
// /media/videos or a take under /media/runs), noted on the song's entry in the audio index, so a song and its covers go together.
// This module is the rules (what a request may say, what it does to an entry); server/main.ts keeps the index and the files.

export interface AudioEntry {
  file: string;
  url: string;
  name: string;
  kind: string;
  seconds: number;
  prompt?: string;
  createdAt: string;
  /** The cover picture's url (a kept picture). */
  cover?: string;
  /** The video cover's url (a kept clip) and its length in seconds. */
  coverVideo?: string;
  coverSeconds?: number;
}

export interface CoverRequest {
  file: string;
  cover?: string;
  video?: string;
  seconds?: number;
  /** "all": the cover and the video go; "video": only the video. */
  clear?: "all" | "video";
}

/** A request the server cannot take, with what to tell the person. */
export class CoverError extends Error {}

export const COVER_FIELDS = ["cover", "coverVideo", "coverSeconds"] as const;

const SONG_FILE = /^[\w-]{1,80}\.(mp3|wav|ogg|flac|m4a)$/i;
const PICTURE_URL = /^\/media\/photos\/[\w][\w.-]{0,120}$/;
const VIDEO_URL = /^\/media\/(?:videos\/[\w][\w.-]{0,120}|runs\/[\w-]{1,60}\/shot\.mp4)$/;

/** The url of a kept picture, or null. */
export const pictureUrl = (v: unknown): string | null => (typeof v === "string" && PICTURE_URL.test(v) ? v : null);
/** The url of a kept clip (or a take), or null. */
export const videoUrl = (v: unknown): string | null => (typeof v === "string" && VIDEO_URL.test(v) ? v : null);

/**
 * What a request to set or clear a song's cover says, checked: the song is a file of the audio library, the cover a kept picture, the
 * video a kept clip, the seconds a length a cover video may have. Throws CoverError with a plain sentence when it is not.
 */
export function readCoverRequest(input: Record<string, unknown> | null | undefined): CoverRequest {
  const body = input ?? {};
  const file = typeof body.file === "string" ? body.file : "";
  if (!SONG_FILE.test(file)) throw new CoverError("Name the song the cover is for.");
  const out: CoverRequest = { file };
  if (body.clear === true || body.clear === "all") out.clear = "all";
  else if (body.clear === "video") out.clear = "video";
  if (body.cover !== undefined && body.cover !== null && body.cover !== "") {
    const url = pictureUrl(body.cover);
    if (!url) throw new CoverError("A cover is a picture kept by the app.");
    out.cover = url;
  }
  if (body.video !== undefined && body.video !== null && body.video !== "") {
    const url = videoUrl(body.video);
    if (!url) throw new CoverError("A video cover is a clip kept by the app.");
    out.video = url;
  }
  if (body.seconds !== undefined && body.seconds !== null && body.seconds !== "") {
    const s = Number(body.seconds);
    if (!Number.isFinite(s) || s < 1 || s > 30) throw new CoverError("A video cover runs between 1 and 30 seconds.");
    out.seconds = Math.round(s * 100) / 100;
  }
  if (!out.clear && out.cover === undefined && out.video === undefined) throw new CoverError("Say what the cover is, or clear it.");
  if (out.clear && (out.cover !== undefined || out.video !== undefined)) throw new CoverError("A cover is set or cleared, not both.");
  return out;
}

/**
 * The entry with the request done: a new cover keeps its song's other covers except that a new picture leaves a video that was made
 * from the old one (the video then no longer matches the cover) unless the request brings its own; a cleared cover takes its video
 * with it. The entry given is not changed.
 */
export function mergeCover(entry: AudioEntry, req: CoverRequest): AudioEntry {
  const next: AudioEntry = { ...entry };
  if (req.clear === "all") {
    for (const f of COVER_FIELDS) delete next[f];
    return next;
  }
  if (req.clear === "video") {
    delete next.coverVideo;
    delete next.coverSeconds;
    return next;
  }
  if (req.cover !== undefined && req.cover !== entry.cover && req.video === undefined) {
    delete next.coverVideo;
    delete next.coverSeconds;
  }
  if (req.cover !== undefined) next.cover = req.cover;
  if (req.video !== undefined) {
    next.coverVideo = req.video;
    if (req.seconds !== undefined) next.coverSeconds = req.seconds;
    else delete next.coverSeconds;
  }
  return next;
}
