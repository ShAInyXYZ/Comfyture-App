import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('tabs share streams, all receive job updates, control targets one page and last close releases the connection', async () => {
  const sources = [];
  class Source {
    listeners = new Map();
    constructor(url) { this.url = url; sources.push(this); }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    emit(name, data = '{}') { this.listeners.get(name)({ data }); }
    close() { this.closed = true; }
  }
  const self = { location: { origin: 'http://localhost:5177' } };
  vm.runInNewContext(await readFile('web/js/live-events-worker.js', 'utf8'), { self, EventSource: Source, URL, Map, Set });
  const connect = (path = '/api/events') => {
    const port = { messages: [], postMessage(m) { this.messages.push(m); }, start() {} };
    self.onconnect({ ports: [port] });
    port.onmessage({ data: { op: 'subscribe', url: `http://localhost:5177${path}` } });
    return port;
  };
  const a = connect(), b = connect(), c = connect();
  assert.equal(sources.length, 1);
  sources[0].emit('paint', '{"id":"picture","status":"done"}');
  for (const port of [a,b,c]) assert.equal(port.messages[0].type, 'paint');
  const d = connect('/api/control/events'), e = connect('/api/control/events');
  assert.equal(sources.length, 2);
  sources[1].emit('command');
  assert.equal(d.messages.length, 0);
  assert.equal(e.messages.length, 1);
  e.onmessage({ data: { op: 'close' } });
  sources[1].emit('command');
  assert.equal(d.messages.length, 1);
  for (const port of [a,b]) port.onmessage({ data: { op: 'close' } });
  assert.equal(sources[0].closed, undefined);
  c.onmessage({ data: { op: 'close' } });
  assert.equal(sources[0].closed, true);
});
