import { attribution, type Attribution } from './attribution';
import type { ReleaseConfig } from './config';
export const SDK_VERSION = '1.0.2';
export const EVENT_NAMES = [
  'session_start',
  'load_success',
  'load_error',
  'run_start',
  'run_abandon',
  'pause',
  'resume',
  'milestone',
  'run_end',
  'heartbeat',
  'pagehide',
  'share_open',
  'share_intent',
  'share_complete',
  'share_cancel',
  'share_error',
  'share_fallback',
  'card_ready',
  'card_error',
  'card_download',
  'link_copy',
  'link_copy_error',
  'referral_visit',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export type Details = {
  run_id?: string;
  score?: number;
  milestone?: string;
  outcome?: 'completed' | 'failed';
  cause?: string;
  index?: number;
  new_record?: boolean;
  reason?: string;
  share_id?: string;
  method?: string;
};
export type AnalyticsEvent = {
  schema: 2;
  game_id: string;
  sdk_version: string;
  id: string;
  type: EventName;
  at: number;
  session_id: string;
  visitor_id: string;
  version: string;
  environment: string;
  platform: string;
  language: string;
  device: string;
  current: Attribution;
  first: Attribution;
  page_ms: number;
  foreground_ms: number;
  play_ms: number;
  data: Details;
};
const KEY = 'game-lab:analytics:v2',
  OPT = 'game-lab:analytics-optout',
  LEGACY_OPT = 'orbital-analytics-optout',
  LEGACY_KEY = 'orbital-analytics-v1';
const MAX_QUEUE = 300,
  TTL = 7 * 86400_000;
export const id = () => crypto.randomUUID();
export function optedOut() {
  try {
    return localStorage.getItem(OPT) === '1' || localStorage.getItem(LEGACY_OPT) === '1';
  } catch {
    return false;
  }
}
export class Analytics {
  private queue: AnalyticsEvent[] = [];
  private visitor = '';
  session = id();
  readonly current: Attribution;
  private first: Attribution;
  private started = performance.now();
  private last = this.started;
  private foreground = 0;
  private play = 0;
  private focused = document.hasFocus();
  private visible = !document.hidden;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;
  private failures = 0;
  private nextAttempt = 0;
  private stopped = false;
  private loaded: 'load_success' | 'load_error' | undefined;
  private storageKey: string;
  private queueKey = '';
  language = 'en';
  enabled = false;
  constructor(
    private config: ReleaseConfig,
    language = 'en',
  ) {
    this.language = language;
    this.current = attribution(location.href, document.referrer);
    this.first = this.current;
    this.storageKey =
      KEY + ':' + config.gameId + ':' + config.environment + ':' + config.analyticsEndpoint;
    const disabled = optedOut();
    this.enabled = !!config.analyticsEndpoint && !disabled;
    if (disabled) this.setEnabled(false);
    if (this.enabled) this.begin();
    window.addEventListener('focus', this.focus);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.hide);
    window.addEventListener('pageshow', this.show);
    window.addEventListener('online', this.online);
    window.addEventListener('storage', this.storage);
    this.timer = setInterval(() => {
      this.sample();
      if (this.visible) this.event('heartbeat');
      void this.flush();
    }, 15_000);
  }
  private begin() {
    this.session = id();
    this.queueKey = this.storageKey + ':queue:' + this.session;
    this.visitor = id();
    try {
      const s = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      if (s?.expires > Date.now() && /^[a-f0-9-]{36}$/.test(s.visitor)) {
        this.visitor = s.visitor;
        if (
          s.first &&
          ['query', 'referrer_query', 'referrer_origin', 'unknown'].includes(s.first.evidence) &&
          ['source', 'medium', 'campaign', 'content', 'referral'].every(
            (k) => typeof s.first[k] === 'string' && /^[a-zA-Z0-9_.-]{0,64}$/.test(s.first[k]),
          )
        )
          this.first = s.first;
      }
      const pending = new Map<string, AnalyticsEvent>();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(this.storageKey + ':queue:')) continue;
        try {
          const saved = JSON.parse(localStorage.getItem(key) || '[]');
          const fresh = Array.isArray(saved)
            ? saved.filter(
                (e: AnalyticsEvent) =>
                  e.schema === 2 &&
                  e.game_id === this.config.gameId &&
                  e.at > Date.now() - TTL &&
                  e.at < Date.now() + 300000 &&
                  e.environment === this.config.environment,
              )
            : [];
          if (!fresh.length) localStorage.removeItem(key);
          else for (const e of fresh) pending.set(e.id, e);
        } catch {
          localStorage.removeItem(key);
        }
      }
      this.queue = [...pending.values()].sort((a, b) => a.at - b.at).slice(-MAX_QUEUE);
    } catch {}
    this.event('session_start');
    if (this.current.referral) this.event('referral_visit', { share_id: this.current.referral });
    if (this.loaded) this.event(this.loaded);
    void this.flush();
  }
  private sample() {
    const now = performance.now(),
      delta = Math.max(0, now - this.last);
    // Large callback gaps (suspend/sleep) cannot prove active attention.
    if (this.enabled && this.visible && this.focused && delta <= 30_000) this.foreground += delta;
    this.last = now;
  }
  advancePlay(seconds: number) {
    if (this.enabled) this.play += Math.max(0, seconds * 1000);
  }
  event(type: EventName, data: Details = {}) {
    if (type === 'load_success' || type === 'load_error') this.loaded = type;
    if (!this.enabled || this.stopped) return;
    this.sample();
    this.queue = this.queue.filter((e) => e.at > Date.now() - TTL);
    this.queue.push({
      schema: 2,
      game_id: this.config.gameId,
      sdk_version: SDK_VERSION,
      id: id(),
      type,
      at: Date.now(),
      session_id: this.session,
      visitor_id: this.visitor,
      version: this.config.gameVersion,
      environment: this.config.environment,
      platform: this.config.platform,
      language: this.language,
      device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer',
      current: this.current,
      first: this.first,
      page_ms: Math.round(performance.now() - this.started),
      foreground_ms: Math.round(this.foreground),
      play_ms: Math.round(this.play),
      data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    });
    while (this.queue.length > MAX_QUEUE) {
      const i = this.queue.findIndex((e) => e.type === 'heartbeat');
      this.queue.splice(i < 0 ? 0 : i, 1);
    }
    this.persist();
    if (type !== 'heartbeat') void this.flush();
  }
  private persist() {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          visitor: this.visitor,
          first: this.first,
          endpoint: this.config.analyticsEndpoint,
          expires: Date.now() + 90 * 86400_000,
        }),
      );
      localStorage.setItem(this.queueKey, JSON.stringify(this.queue));
    } catch {}
  }
  async flush(force = false) {
    if (
      !this.enabled ||
      this.stopped ||
      this.inFlight ||
      !this.queue.length ||
      (!force && Date.now() < this.nextAttempt)
    )
      return;
    this.inFlight = true;
    let progressed = false;
    // Keep a beacon/fetch body below 32 KiB. Acks, not beacon's boolean, remove events.
    const batch: AnalyticsEvent[] = [];
    for (const e of this.queue) {
      if (batch.length >= 20 || JSON.stringify([...batch, e]).length > 28_000) break;
      batch.push(e);
    }
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(this.config.analyticsEndpoint, {
        method: 'POST',
        body: JSON.stringify({ events: batch }),
        headers: { 'Content-Type': 'text/plain' },
        credentials: 'omit',
        signal: controller.signal,
        keepalive: true,
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('Collection unavailable');
      const result = (await response.json()) as { accepted?: unknown[]; rejected?: unknown[] };
      if (!Array.isArray(result.accepted)) throw new Error('Missing acknowledgement');
      const ack = new Set(
        [...result.accepted, ...(Array.isArray(result.rejected) ? result.rejected : [])].filter(
          (v: unknown) => batch.some((e) => e.id === v),
        ),
      );
      // Each document owns a lane. Prune acknowledged copies across lanes;
      // concurrent stale rewrites can only duplicate events, not lose another tab's queue.
      if (this.enabled && !this.stopped)
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key?.startsWith(this.storageKey + ':queue:')) continue;
            const saved = JSON.parse(localStorage.getItem(key) || '[]');
            const remaining = Array.isArray(saved)
              ? saved.filter((e: AnalyticsEvent) => !ack.has(e.id) && e.at > Date.now() - TTL)
              : [];
            if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
            else localStorage.removeItem(key);
          }
        } catch {}
      progressed = ack.size > 0;
      this.queue = this.queue.filter((e) => !ack.has(e.id));
      this.failures = 0;
      this.nextAttempt = 0;
      if (this.enabled && !this.stopped) this.persist();
    } catch {
      this.failures++;
      this.nextAttempt =
        Date.now() +
        Math.min(300_000, 1000 * 2 ** Math.min(8, this.failures)) * (0.8 + Math.random() * 0.4);
    } finally {
      clearTimeout(timeout);
      this.inFlight = false;
      if (progressed && this.queue.length) void this.flush();
    }
  }
  private focus = () => {
    this.sample();
    this.focused = true;
  };
  private blur = () => {
    this.sample();
    this.focused = false;
    this.event('heartbeat');
  };
  private visibility = () => {
    this.sample();
    this.visible = !document.hidden;
    this.focused = document.hasFocus();
    if (!this.visible) this.hide();
  };
  private hide = () => {
    this.event('pagehide');
    if (!this.enabled || !this.queue.length) return;
    try {
      navigator.sendBeacon?.(
        this.config.analyticsEndpoint,
        new Blob([JSON.stringify({ events: this.queue.slice(0, 20) })], { type: 'text/plain' }),
      );
    } catch {}
  };
  private show = () => {
    this.last = performance.now();
    this.visible = !document.hidden;
    this.focused = document.hasFocus();
    void this.flush(true);
  };
  private online = () => {
    void this.flush(true);
  };
  private storage = (e: StorageEvent) => {
    if ((e.key === OPT || e.key === LEGACY_OPT) && e.newValue === '1') this.setEnabled(false);
  };
  setEnabled(value: boolean) {
    try {
      localStorage.setItem(OPT, value ? '0' : '1');
      // Retained v1 bundles must honor opt-out after a rollback or in another tab.
      if (value) localStorage.removeItem(LEGACY_OPT);
      else localStorage.setItem(LEGACY_OPT, '1');
    } catch {}
    if (!value) {
      this.enabled = false;
      this.queue = [];
      this.visitor = '';
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k?.startsWith(KEY + ':') || k?.startsWith(LEGACY_KEY + ':'))
            localStorage.removeItem(k);
        }
      } catch {}
    } else if (!this.enabled && this.config.analyticsEndpoint) {
      this.enabled = true;
      this.started = this.last = performance.now();
      this.foreground = this.play = 0;
      this.first = this.current;
      this.begin();
    }
  }
  destroy() {
    this.hide();
    this.stopped = true;
    clearInterval(this.timer);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.hide);
    window.removeEventListener('pageshow', this.show);
    window.removeEventListener('online', this.online);
    window.removeEventListener('storage', this.storage);
  }
}
