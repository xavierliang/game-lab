import { releaseConfig as sharedConfig } from '@game-lab/services/config';
import game from '../game.json';
export { publicUrl, type ReleaseConfig } from '@game-lab/services/config';
export const VERSION = game.version;
export function releaseConfig() {
  return sharedConfig({ gameId: game.id, gameVersion: game.version });
}
