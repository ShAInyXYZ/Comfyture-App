// Terminal events may arrive before the request that created the job returns.
// Keep them, and allow several consumers to follow the same job independently.
export function completionFeed() {
  const latest = new Map();
  const pending = new Map();
  const terminal = (x) => ["done", "failed", "canceled"].includes(x?.status);
  const settle = (x, resolve, reject) => x.status === "done" ? resolve(x)
    : reject(new Error(x.status === "canceled" ? "Canceled." : x.error ?? "That didn't work."));
  return {
    publish(x) {
      latest.set(x.id, x);
      if (!terminal(x)) return;
      for (const [resolve, reject] of pending.get(x.id) ?? []) settle(x, resolve, reject);
      pending.delete(x.id);
      if (latest.size > 512) {
        for (const [id, entry] of latest) {
          if (terminal(entry) && !pending.has(id)) latest.delete(id);
          if (latest.size <= 512) break;
        }
      }
    },
    wait(id, snapshot) {
      const current = terminal(snapshot) ? snapshot : latest.get(id) ?? snapshot;
      if (terminal(current)) return new Promise((resolve, reject) => settle(current, resolve, reject));
      return new Promise((resolve, reject) => {
        if (!pending.has(id)) pending.set(id, []);
        pending.get(id).push([resolve, reject]);
      });
    },
  };
}
