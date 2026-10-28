// HTTP/1 browsers allow only a few connections per origin. Share the two live
// streams across tabs so uploads and generation requests still have room.
export function liveEvents(path) {
  if (typeof SharedWorker === "undefined") return new EventSource(path);
  let worker;
  try {
    worker = new SharedWorker(new URL("./live-events-worker.js", import.meta.url), { name: "comfyture-events" });
  } catch {
    return new EventSource(path);
  }
  const events = new EventTarget();
  events.readyState = EventSource.CONNECTING;
  let closed = false;
  worker.port.onmessage = ({ data }) => {
    if (data.type === "hello") events.readyState = EventSource.OPEN;
    if (data.type === "error") events.readyState = EventSource.CONNECTING;
    events.dispatchEvent(new MessageEvent(data.type, { data: data.data }));
  };
  worker.port.start();
  worker.port.postMessage({ op: "subscribe", url: new URL(path, document.baseURI).href });
  events.close = () => {
    if (closed) return;
    closed = true;
    events.readyState = EventSource.CLOSED;
    worker.port.postMessage({ op: "close" });
    worker.port.close();
    window.removeEventListener("pagehide", leaving);
  };
  const leaving = (event) => { if (!event.persisted) events.close(); };
  window.addEventListener("pagehide", leaving);
  return events;
}
