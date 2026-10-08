import {
  Analytics as SharedAnalytics,
  type Details,
  type EventName,
} from '@game-lab/services/analytics';
export { id, optedOut, type EventName } from '@game-lab/services/analytics';
type OrbitDetails = Omit<Details, 'milestone'> & { score_ms?: number; milestone?: number | string };
/** Translate flight-specific engine events at the game boundary. */
export class Analytics extends SharedAnalytics {
  event(type: EventName | 'death', data: OrbitDetails = {}) {
    const { score_ms, milestone, ...rest } = data;
    super.event(type === 'death' ? 'run_end' : type, {
      ...rest,
      ...(score_ms === undefined ? {} : { score: score_ms / 1000 }),
      ...(milestone === undefined
        ? {}
        : { milestone: typeof milestone === 'number' ? `survive-${milestone}` : milestone }),
      ...(type === 'death' ? { outcome: 'failed' as const } : {}),
    });
  }
}
