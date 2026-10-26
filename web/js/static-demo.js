// The live demo's replay: with no server, a read of the API is answered from the snapshot the build recorded (js/snapshot.js names the
// files), anything that would change or render is refused, and the live streams never open. Loaded first by app.js; with the page not
// static it does nothing at all.
import { absoluteUrls, snapshotFile } from "./snapshot.js";

const REFUSED = "This is the live demo, so rendering is off. Run Comfyture yourself to roll takes: see the README.";

if (document.documentElement.hasAttribute("data-static")) {
  const real = window.fetch.bind(window);
  const missing = () => new Response(JSON.stringify({ error: "Not in the live demo" }), { status: 404, headers: { "Content-Type": "application/json" } });
  window.fetch = (input, init) => {
    const request = input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const url = new URL(request ? request.url : String(input), document.baseURI);
    // (the folder the demo is served from: "/Comfyture/" when the page is "/Comfyture/index.html")
    const base = new URL(".", document.baseURI).pathname;
    if (url.origin !== location.origin || !url.pathname.startsWith(`${base}api/`)) return real(input, init);
    if (method !== "GET") return Promise.reject(new Error(REFUSED));
    const file = new URL(snapshotFile(url.pathname.slice(base.length) + url.search), document.baseURI);
    return real(file).then(async (res) => (res.ok && /json/.test(res.headers.get("Content-Type") ?? "") ? new Response(absoluteUrls(await res.text(), base), { headers: { "Content-Type": "application/json" } }) : missing()));
  };
  // a stream that never connects and never fails: the demo has nothing to tell
  window.EventSource = class {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    constructor(url) {
      this.url = url;
    }
    addEventListener() {}
    removeEventListener() {}
    close() {
      this.readyState = 2;
    }
  };
}
