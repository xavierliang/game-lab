import { loadGames } from '../../tooling/registry.mjs';
export const registry = new Map(loadGames().map((g) => [g.id, g]));
export const names = new Set([
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
]);
const uuid = (v) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const label = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.-]{0,64}$/.test(v);
const object = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const keys = (x, list) => Object.keys(x).every((k) => list.includes(k));
const num = (v, max = 604800000) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const version = (v) => typeof v === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v);
function source(a) {
  return (
    object(a) &&
    keys(a, ['source', 'medium', 'campaign', 'content', 'referral', 'evidence']) &&
    ['source', 'medium', 'campaign', 'content', 'referral'].every((k) => label(a[k])) &&
    ['query', 'referrer_query', 'referrer_origin', 'unknown'].includes(a.evidence)
  );
}
export function normalizeLegacy(e) {
  if (
    !object(e) ||
    e.schema !== 1 ||
    !keys(e, [
      'schema',
      'id',
      'type',
      'at',
      'session_id',
      'visitor_id',
      'version',
      'environment',
      'platform',
      'language',
      'device',
      'current',
      'first',
      'page_ms',
      'foreground_ms',
      'play_ms',
      'data',
    ]) ||
    !object(e.data) ||
    !keys(e.data, [
      'run_id',
      'score_ms',
      'milestone',
      'cause',
      'index',
      'new_record',
      'reason',
      'share_id',
      'method',
    ])
  )
    return null;
  const { score_ms, milestone, ...data } = e.data;
  if (score_ms !== undefined && !num(score_ms)) return null;
  if (milestone !== undefined && ![30, 60, 120].includes(milestone)) return null;
  return {
    ...e,
    schema: 2,
    game_id: 'orbital-drift',
    sdk_version: '0.0.0',
    type: e.type === 'death' ? 'run_end' : e.type,
    data: {
      ...data,
      ...(score_ms === undefined ? {} : { score: score_ms / 1000 }),
      ...(milestone === undefined ? {} : { milestone: `survive-${milestone}` }),
      ...(e.type === 'death' ? { outcome: 'failed' } : {}),
    },
  };
}
export function validEvent(e, now = Date.now()) {
  if (
    !object(e) ||
    !keys(e, [
      'schema',
      'game_id',
      'sdk_version',
      'id',
      'type',
      'at',
      'session_id',
      'visitor_id',
      'version',
      'environment',
      'platform',
      'language',
      'device',
      'current',
      'first',
      'page_ms',
      'foreground_ms',
      'play_ms',
      'data',
    ])
  )
    return false;
  const game = registry.get(e.game_id);
  if (
    !game ||
    e.schema !== 2 ||
    !uuid(e.id) ||
    !uuid(e.session_id) ||
    !uuid(e.visitor_id) ||
    !names.has(e.type) ||
    !version(e.version) ||
    !version(e.sdk_version) ||
    !Number.isSafeInteger(e.at) ||
    e.at < now - 7 * 86400000 ||
    e.at > now + 300000
  )
    return false;
  if (
    !['production', 'test'].includes(e.environment) ||
    (game.status === 'example' && e.environment !== 'test') ||
    !['itch', 'standalone'].includes(e.platform) ||
    !['en', 'zh'].includes(e.language) ||
    !['touch', 'pointer'].includes(e.device)
  )
    return false;
  if (
    !source(e.current) ||
    !source(e.first) ||
    !['page_ms', 'foreground_ms', 'play_ms'].every((k) => num(e[k])) ||
    e.foreground_ms > e.page_ms + 1000 ||
    e.play_ms > e.page_ms + 1000
  )
    return false;
  const d = e.data;
  if (
    !object(d) ||
    !keys(d, [
      'run_id',
      'score',
      'milestone',
      'cause',
      'index',
      'new_record',
      'reason',
      'share_id',
      'method',
      'outcome',
    ])
  )
    return false;
  if (d.run_id !== undefined && !uuid(d.run_id)) return false;
  if (d.score !== undefined && (!Number.isFinite(d.score) || d.score < 0 || d.score > 1e9))
    return false;
  if (d.milestone !== undefined && !game.milestones.some((m) => m.id === d.milestone)) return false;
  if (d.cause !== undefined && !game.causes.includes(d.cause)) return false;
  if (d.index !== undefined && (!num(d.index, 10000) || d.index < 1)) return false;
  if (d.new_record !== undefined && typeof d.new_record !== 'boolean') return false;
  if (d.reason !== undefined && !['manual', 'background', 'settings', 'restart'].includes(d.reason))
    return false;
  if (d.share_id !== undefined && !label(d.share_id)) return false;
  if (d.method !== undefined && !['file', 'text'].includes(d.method)) return false;
  if (d.outcome !== undefined && !['completed', 'failed'].includes(d.outcome)) return false;
  if (
    ['run_start', 'run_abandon', 'pause', 'resume', 'milestone', 'run_end'].includes(e.type) &&
    (!d.run_id || d.score === undefined)
  )
    return false;
  if (e.type === 'run_start' && (d.index === undefined || d.score !== 0)) return false;
  if (
    e.type === 'milestone' &&
    (!d.milestone || d.score + 0.001 < game.milestones.find((m) => m.id === d.milestone).value)
  )
    return false;
  if (e.type === 'run_end' && !d.outcome) return false;
  if (
    (e.type.startsWith('share_') ||
      e.type.startsWith('card_') ||
      e.type.startsWith('link_') ||
      e.type === 'referral_visit') &&
    !d.share_id
  )
    return false;
  if (e.type === 'referral_visit' && d.share_id !== e.current.referral) return false;
  return true;
}
export function logicalKey(e) {
  const prefix = `${e.game_id}:${e.environment}:${e.session_id}`;
  if (['session_start', 'load_success', 'load_error', 'referral_visit'].includes(e.type))
    return `${prefix}:${e.type}`;
  if (['run_start', 'run_abandon', 'run_end', 'milestone'].includes(e.type))
    return `${prefix}:${e.data.run_id}:${e.type}:${e.data.milestone || ''}`;
  return `${e.game_id}:${e.id}`;
}
