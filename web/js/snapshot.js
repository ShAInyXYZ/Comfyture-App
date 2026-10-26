// Where the live demo keeps the answer to an API read. The demo's build (scripts/demo-site.ts) writes the files and the browser
// (js/static-demo.js) asks for them, both through this one function, so they cannot disagree.

// a file name keeps letters, digits and . _ = & , -; anything else is ~ and its code in hex
const safe = (text, keep = "") => text.replace(new RegExp(`[^A-Za-z0-9._=&,${keep}-]`, "g"), (c) => `~${c.charCodeAt(0).toString(16)}`);
const decode = (text) => {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
};

/** The file that holds the answer to a GET: `api/stories?b=2&a=1` is `api/stories__a=1&b=2.json`. */
export function snapshotFile(path) {
  const [route, query = ""] = path.replace(/^\/+/, "").split("?");
  const pairs = query.split("&").filter(Boolean).map(decode).sort();
  let name = safe(decode(route).replaceAll("~", ""), "/");
  if (pairs.length) {
    const whole = pairs.join("&");
    let tail = safe(whole);
    // (a very long query is cut short, and a sum of the whole keeps it apart from the others)
    if (tail.length > 100) tail = `${tail.slice(0, 80)}-${[...whole].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
    name += `__${tail}`;
  }
  return `${name}.json`;
}

// The folders the server serves files from, by their first name. In the snapshot the answers name their files relatively
// ("media/photos/a.jpg"), so the site works under any sub-path; the page puts the folder it is served from back in front, as the server does with "/".
export const FILE_FOLDERS = ["media", "presets", "samples", "brand", "models"];
const FOLDER_URL = new RegExp(`"/?(${FILE_FOLDERS.join("|")})/`, "g");

/** An answer from the server with its file URLs made relative (what the build writes). */
export const relativeUrls = (text) => text.replace(FOLDER_URL, '"$1/');
/** A snapshot with its file URLs made absolute under `base` ("/Comfyture/"), the shape the server gives them. */
export const absoluteUrls = (text, base) => text.replace(FOLDER_URL, `"${base}$1/`);
