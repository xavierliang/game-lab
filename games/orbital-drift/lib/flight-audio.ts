export type AudioSettings = { music: number; effects: number; muted: boolean };
export type AudioStatus = 'loading' | 'ready' | 'unavailable';
type Sound = 'music' | 'launch' | 'explosion' | 'thruster' | 'ui';
const files: Record<Sound, string> = {
  music: 'music.mp3',
  launch: 'launch.wav',
  explosion: 'explosion.wav',
  thruster: 'thruster.wav',
  ui: 'ui.wav',
};
const clamp = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
export function readAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('orbital-drift-audio') || '{}');
    return {
      music: clamp(saved.music, 0.5),
      effects: clamp(saved.effects, 0.55),
      muted: saved.muted === true,
    };
  } catch {
    return { music: 0.5, effects: 0.55, muted: false };
  }
}

/** Audio never gates flight. Only a real start/resume/settings gesture unlocks it. */
export class FlightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private buffers = new Map<Sound, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private musicSource: AudioBufferSourceNode | null = null;
  private engineSource: AudioBufferSourceNode | null = null;
  private bytes: Promise<Partial<Record<Sound, ArrayBuffer>>> | null = null;
  private decoded: Promise<void> | null = null;
  private playing = false;
  private thrust = false;
  private disposed = false;
  private generation = 0;
  private musicOffset = 0;
  private musicStarted = 0;
  private abort = new AbortController();
  constructor(
    private settings: AudioSettings,
    private status: (value: AudioStatus) => void = () => {},
    private base = './audio/',
  ) {}

  preload() {
    if (!this.bytes)
      this.bytes = Promise.all(
        Object.entries(files).map(async ([name, file]) => {
          const controller = new AbortController();
          const cancel = () => controller.abort();
          this.abort.signal.addEventListener('abort', cancel, { once: true });
          const timeout = setTimeout(cancel, 15000);
          try {
            const embedded = (window as unknown as { __ORBITAL_ASSETS__?: Record<string, string> })
              .__ORBITAL_ASSETS__;
            const response = await fetch(embedded?.[this.base + file] ?? this.base + file, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error('Audio unavailable');
            return [name, await response.arrayBuffer()] as const;
          } catch {
            return [name, undefined] as const;
          } finally {
            clearTimeout(timeout);
            this.abort.signal.removeEventListener('abort', cancel);
          }
        }),
      ).then((entries) => Object.fromEntries(entries));
    return this.bytes;
  }
  private unlock(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    try {
      if (!this.context) {
        const AudioCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.musicGain = this.context.createGain();
        this.musicGain.connect(this.master);
        this.effectsGain = this.context.createGain();
        this.effectsGain.connect(this.master);
        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0;
        this.engineGain.connect(this.effectsGain);
        this.applyGains();
      }
      // resume() must happen synchronously within the gesture, before awaiting fetch/decode.
      const resumed = this.context.resume().catch(() => {});
      if (!this.decoded)
        this.decoded = this.preload().then(async (data) => {
          await Promise.all(
            Object.entries(data).map(async ([name, bytes]) => {
              if (!bytes || this.disposed) return;
              try {
                const buffer = await this.context!.decodeAudioData(bytes);
                if (!this.disposed) this.buffers.set(name as Sound, buffer);
              } catch {
                /* A bad file cannot prevent play. */
              }
            }),
          );
          if (!this.disposed) this.status(this.buffers.size === 5 ? 'ready' : 'unavailable');
        });
      return Promise.all([resumed, this.decoded]).then(() => {});
    } catch {
      this.status('unavailable');
      return Promise.resolve();
    }
  }
  private source(name: Sound, output: AudioNode, loop = false, offset = 0) {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.context || this.disposed || this.context.state !== 'running') return null;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(output);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
    };
    source.start(0, offset % buffer.duration);
    return source;
  }
  private stop(source: AudioBufferSourceNode | null) {
    if (source) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
      this.sources.delete(source);
    }
  }
  private loops() {
    if (!this.playing || this.disposed || !this.musicGain || !this.engineGain || !this.context)
      return;
    if (!this.musicSource) {
      this.musicSource = this.source('music', this.musicGain, true, this.musicOffset);
      this.musicStarted = this.context.currentTime;
    }
    if (!this.engineSource) this.engineSource = this.source('thruster', this.engineGain, true);
    this.setThrust(this.thrust);
  }
  start(restart = true) {
    if (restart) this.musicOffset = 0;
    this.stopLoops(!restart);
    for (const source of [...this.sources]) this.stop(source);
    this.playing = true;
    const token = ++this.generation;
    void this.unlock().then(() => {
      if (token !== this.generation || !this.playing || this.disposed) return;
      this.loops();
      if (restart && this.effectsGain) this.source('launch', this.effectsGain);
    });
  }
  private stopLoops(saveOffset: boolean) {
    if (saveOffset && this.musicSource && this.context)
      this.musicOffset += this.context.currentTime - this.musicStarted;
    this.stop(this.musicSource);
    this.stop(this.engineSource);
    this.musicSource = null;
    this.engineSource = null;
  }
  pause() {
    this.playing = false;
    this.thrust = false;
    ++this.generation;
    this.stopLoops(true);
    for (const source of [...this.sources]) this.stop(source);
  }
  end() {
    this.pause();
    if (this.effectsGain && !this.settings.muted) this.source('explosion', this.effectsGain);
  }
  click() {
    const token = this.generation;
    void this.unlock().then(() => {
      if (
        token === this.generation &&
        !document.hidden &&
        this.effectsGain &&
        !this.disposed &&
        !this.settings.muted
      )
        this.source('ui', this.effectsGain);
    });
  }
  setThrust(active: boolean) {
    this.thrust = active;
    if (this.engineGain && this.context)
      this.engineGain.gain.setTargetAtTime(
        this.playing && active ? 0.3 : 0,
        this.context.currentTime,
        0.04,
      );
  }
  setSettings(value: AudioSettings) {
    this.settings = {
      music: clamp(value.music, 0.5),
      effects: clamp(value.effects, 0.55),
      muted: !!value.muted,
    };
    try {
      localStorage.setItem('orbital-drift-audio', JSON.stringify(this.settings));
    } catch {}
    this.applyGains();
    void this.unlock().then(() => this.loops());
  }
  setMuted(muted: boolean) {
    this.setSettings({ ...this.settings, muted });
  }
  private applyGains() {
    if (!this.context) return;
    this.master?.gain.setTargetAtTime(
      this.settings.muted ? 0 : 0.8,
      this.context.currentTime,
      0.025,
    );
    this.musicGain?.gain.setTargetAtTime(this.settings.music * 0.7, this.context.currentTime, 0.08);
    this.effectsGain?.gain.setTargetAtTime(
      this.settings.effects * 0.65,
      this.context.currentTime,
      0.025,
    );
  }
  destroy() {
    this.pause();
    this.disposed = true;
    this.abort.abort();
    if (this.context) void this.context.close().catch(() => {});
  }
}
