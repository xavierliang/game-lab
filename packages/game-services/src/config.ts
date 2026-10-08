export type GameIdentity = { gameId: string; gameVersion: string; example?: boolean };
export type ReleaseConfig = GameIdentity & {
  analyticsEndpoint: string;
  officialUrl: string;
  playUrl: string;
  environment: 'production' | 'test';
  platform: 'itch' | 'standalone';
};
declare global {
  interface Window {
    __GAME_CONFIG__?: Partial<ReleaseConfig>;
    __GAME_OFFLINE__?: boolean;
    __ORBITAL_OFFLINE__?: boolean;
  }
}
export function publicUrl(value: unknown): string {
  try {
    const u = new URL(String(value));
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !u.hostname.includes('.') ||
      /(^|\.)(localhost|test|invalid|example)$/.test(u.hostname) ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) ||
      ['example.com', 'example.org', 'example.net'].includes(u.hostname)
    )
      return '';
    u.search = '';
    u.hash = '';
    return u.href.length <= 240 ? u.href : '';
  } catch {
    return '';
  }
}
export function releaseConfig(identity: GameIdentity): ReleaseConfig {
  const raw = window.__GAME_CONFIG__ ?? {};
  const c = raw.gameId && raw.gameId !== identity.gameId ? {} : raw;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  let endpoint = '';
  try {
    const u = new URL(c.analyticsEndpoint || '');
    if (
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      (u.protocol === 'https:' ||
        (local &&
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
    )
      endpoint = u.href;
  } catch {}
  if (location.protocol === 'file:' || window.__GAME_OFFLINE__ || window.__ORBITAL_OFFLINE__)
    endpoint = '';
  return {
    ...identity,
    analyticsEndpoint: endpoint,
    officialUrl: publicUrl(c.officialUrl),
    playUrl: publicUrl(c.playUrl),
    environment:
      local || identity.example || navigator.webdriver || c.environment !== 'production'
        ? 'test'
        : 'production',
    platform: c.platform === 'itch' ? 'itch' : 'standalone',
  };
}
