import { publicUrl } from './config';
export type ShareMessage = {
  gameId: string;
  title: string;
  text: string;
  url: string;
  fileName?: string;
};
export function referralLink(config: { playUrl: string; officialUrl: string }, shareId: string) {
  const base = publicUrl(config.playUrl) || publicUrl(config.officialUrl);
  if (!base) return '';
  const u = new URL(base);
  u.searchParams.set('utm_source', 'player');
  u.searchParams.set('utm_medium', 'share');
  u.searchParams.set('utm_campaign', 'score-card');
  u.searchParams.set('ref', shareId);
  return u.href;
}
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
      'image/png',
    ),
  );
}
export async function systemShare(
  blob: Blob,
  data: ShareMessage,
  nav: Pick<Navigator, 'share' | 'canShare'> = navigator,
): Promise<{ outcome: 'complete' | 'cancel' | 'fallback' | 'error'; method: string }> {
  let method = 'text';
  try {
    if (!nav.share) return { outcome: 'fallback', method };
    const file = new File([blob], data.fileName || `${data.gameId}-score.png`, {
      type: 'image/png',
    });
    const payload: ShareData = { title: data.title, text: data.text };
    if (data.url) payload.url = data.url;
    if (nav.canShare?.({ files: [file] })) {
      payload.files = [file];
      method = 'file';
    }
    await nav.share(payload);
    return { outcome: 'complete', method };
  } catch (error) {
    return { outcome: (error as Error).name === 'AbortError' ? 'cancel' : 'error', method };
  }
}
export async function copyLink(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
export async function simpleScoreCard(data: {
  title: string;
  score: string;
  detail: string;
  invitation: string;
  url: string;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas unavailable');
  c.fillStyle = '#102b2c';
  c.fillRect(0, 0, 1200, 800);
  c.strokeStyle = '#afd6b655';
  c.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(1000, 100, 120 + i * 70, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = '#a7d4b8';
  c.font = '24px Arial';
  c.fillText('GAME LAB / PERSONAL SCORE', 70, 80);
  c.fillStyle = '#f1f5e9';
  c.font = '48px Arial';
  c.fillText(data.title, 70, 170);
  c.font = '104px monospace';
  c.fillText(data.score, 70, 340);
  c.font = '26px Arial';
  c.fillText(data.detail, 70, 410);
  c.fillStyle = '#c7e9a5';
  c.font = '32px Arial';
  c.fillText(data.invitation, 70, 545);
  c.font = '18px monospace';
  let line = '',
    y = 625;
  for (const ch of data.url) {
    if (c.measureText(line + ch).width > 1060) {
      c.fillText(line, 70, y);
      line = '';
      y += 25;
    }
    line += ch;
  }
  c.fillText(line, 70, y);
  return canvasPng(canvas);
}
