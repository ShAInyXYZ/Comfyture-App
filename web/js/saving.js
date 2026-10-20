// A save kept a moment after the last change, one for each thing being saved: a change to A is not
// forgotten when B is changed before A's moment is up, and anything pending can be sent now (before
// another is opened, or the page is left). Pure: it only needs timers, so the tests run it as it is.

/**
 * `send(key, value)` is what saves; `save(key, value)` notes the latest value of a key and sends it
 * after `delay` ms of quiet for that key; `flush(key)` sends it now (every pending key when none is
 * named) and answers when it is sent. The value is read when it is sent, so a thing changed in place
 * is saved as it is then.
 */
export function keyedSaver(delay, send) {
  const pending = new Map();
  const sendKey = (key) => {
    const p = pending.get(key);
    if (!p) return Promise.resolve();
    clearTimeout(p.timer);
    pending.delete(key);
    return Promise.resolve().then(() => send(key, p.value)).catch(() => {});
  };
  return {
    save(key, value) {
      clearTimeout(pending.get(key)?.timer);
      pending.set(key, { value, timer: setTimeout(() => sendKey(key), delay) });
    },
    flush: (key) => (key === undefined ? Promise.all([...pending.keys()].map(sendKey)) : sendKey(key)),
    /** What was noted for a key is let go, not sent (the thing is gone). */
    drop(key) {
      clearTimeout(pending.get(key)?.timer);
      pending.delete(key);
    },
    has: (key) => pending.has(key),
    get size() {
      return pending.size;
    },
  };
}
