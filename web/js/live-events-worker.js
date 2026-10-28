const streams = new Map();
const names = ["hello", "run", "preview", "paint", "removed", "command", "error"];

self.onconnect = ({ ports: [port] }) => {
  let joined;
  const leave = () => {
    if (!joined) return;
    joined.ports.delete(port);
    if (!joined.ports.size) {
      joined.source.close();
      streams.delete(joined.url);
    }
    joined = null;
  };
  port.onmessage = ({ data }) => {
    if (data.op === "close") { leave(); return; }
    if (data.op !== "subscribe") return;
    const url = new URL(data.url);
    if (url.origin !== self.location.origin || !["/api/events", "/api/control/events"].includes(url.pathname)) return;
    leave();
    if (!streams.has(url.href)) {
      const stream = { url: url.href, source: new EventSource(url.href), ports: new Set(), hello: null };
      streams.set(url.href, stream);
      for (const type of names) stream.source.addEventListener(type, (event) => {
        const message = { type, data: event.data };
        if (type === "hello") stream.hello = message;
        if (type === "error") stream.hello = null;
        // Control commands belong to the last-opened page, as on the server.
        const recipients = type === "command" ? [...stream.ports].slice(-1) : [...stream.ports];
        for (const recipient of recipients) recipient.postMessage(message);
      });
    }
    joined = streams.get(url.href);
    joined.ports.add(port);
    if (joined.hello) port.postMessage(joined.hello);
  };
  port.start();
};
