import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(new URL('../lib/flight-audio.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const { FlightAudio, readAudioSettings } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v),
};
const contexts = [];
class AudioContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  nodes = [];
  sources = [];
  constructor() {
    contexts.push(this);
  }
  createGain() {
    const node = {
      gain: {
        value: 1,
        setTargetAtTime(v) {
          this.value = v;
        },
      },
      connect() {},
    };
    this.nodes.push(node);
    return node;
  }
  createBufferSource() {
    const source = {
      stopped: false,
      loop: false,
      connect() {},
      disconnect() {},
      start(time, offset) {
        this.started = true;
        this.offset = offset;
      },
      stop() {
        this.stopped = true;
        this.onended?.();
      },
    };
    this.sources.push(source);
    return source;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 68 });
  }
}
globalThis.window = { AudioContext };
globalThis.document = { hidden: false };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
const settle = () => new Promise((resolve) => setImmediate(resolve));
const a = new FlightAudio({ music: 0.5, effects: 0.55, muted: false });
assert.equal(contexts.length, 0, 'No audio context or autoplay before a gesture');
a.start();
await settle();
const ctx = contexts.at(-1);
assert.equal(
  ctx.sources.filter((s) => s.loop && !s.stopped).length,
  2,
  'Music and engine begin after gesture',
);
a.setThrust(true);
assert.equal(ctx.nodes[3].gain.value, 0.3);
ctx.currentTime = 12;
a.pause();
assert.ok(
  ctx.sources.every((s) => s.stopped),
  'Pause stops loops AND short sounds',
);
a.start(false);
await settle();
assert.equal(ctx.sources.filter((s) => s.loop && !s.stopped).length, 2);
assert.equal(
  ctx.sources.filter((s) => s.loop && !s.stopped)[0].offset,
  12,
  'Resume retains music position',
);
a.setMuted(true);
assert.equal(ctx.nodes[0].gain.value, 0, 'Mute silences both buses');
a.setSettings({ music: 0, effects: 1, muted: false });
assert.equal(ctx.nodes[1].gain.value, 0);
assert.ok(ctx.nodes[2].gain.value > 0, 'Effects remain independently audible');
a.start();
await settle();
assert.equal(
  ctx.sources.filter((s) => s.loop && !s.stopped)[0].offset,
  0,
  'New flight resets music',
);
assert.equal(
  ctx.sources.filter((s) => !s.stopped).length,
  3,
  'Restart cannot accumulate old launch or explosion sounds',
);
a.end();
assert.equal(ctx.sources.filter((s) => s.loop && !s.stopped).length, 0);
assert.equal(ctx.sources.filter((s) => !s.stopped).length, 1, 'Only the loss sound remains');
a.pause();
assert.ok(
  ctx.sources.every((s) => s.stopped),
  'Backgrounding after death stops loss sound',
);
a.destroy();
assert.equal(ctx.state, 'closed');
// Use one shared gate to emulate slow mobile network and an immediate pause.
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
globalThis.fetch = async () => {
  await gate;
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
};
const b = new FlightAudio(readAudioSettings());
b.start();
b.pause();
release();
await settle();
assert.equal(contexts.at(-1).sources.length, 0, 'Late downloads cannot restart paused audio');
b.destroy();
globalThis.fetch = async () => {
  throw new Error('offline');
};
let status;
const c = new FlightAudio(readAudioSettings(), (s) => (status = s));
c.start();
await settle();
assert.equal(status, 'unavailable');
assert.equal(contexts.at(-1).sources.length, 0, 'Missing audio fails silently');
c.destroy();
storage.set('orbital-drift-audio', '{"music":999,"effects":-2,"muted":true}');
assert.deepEqual(readAudioSettings(), { music: 1, effects: 0, muted: true });
storage.set('orbital-drift-audio', 'broken');
assert.deepEqual(readAudioSettings(), { music: 0.5, effects: 0.55, muted: false });
console.log(
  'PASS: no autoplay; loop start/resume/restart; independent volume/mute; pause/blur teardown; slow loading race; missing files; stored settings validation.',
);
