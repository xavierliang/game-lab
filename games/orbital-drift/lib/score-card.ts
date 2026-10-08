import { canvasPng, systemShare as sharedSystemShare } from '@game-lab/services/sharing';
export type CardData = {
  score: number;
  achieved: number[];
  newRecord: boolean;
  language: 'en' | 'zh';
  shareId: string;
  url: string;
};
export { referralLink } from '@game-lab/services/sharing';
export const scoreText = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(Math.floor((s % 60) * 10) / 10).toFixed(1).padStart(4, '0')}`;
export async function scoreCard(data: CardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas unavailable');
  const zh = data.language === 'zh';
  c.fillStyle = '#07131c';
  c.fillRect(0, 0, 1200, 900);
  // The existing packaged art is optional; typography always remains usable.
  const asset = async (file: string) => {
    const image = new Image();
    const embedded = (window as unknown as { __ORBITAL_ASSETS__?: Record<string, string> })
      .__ORBITAL_ASSETS__;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Asset timeout')), 3000);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Asset unavailable'));
      };
      image.src = embedded?.['./assets/' + file] || './assets/' + file;
    });
    return image;
  };
  try {
    const [bg, planet, ship] = await Promise.all(
      ['space-background.jpg', 'planet.png', 'ship.png'].map(asset),
    );
    c.globalAlpha = 0.4;
    c.drawImage(bg, 0, 0, 1200, 900);
    c.globalAlpha = 1;
    c.drawImage(planet, 800, 200, 300, 300);
    c.save();
    c.translate(865, 545);
    c.rotate(-0.5);
    c.drawImage(ship, -68, -68, 136, 136);
    c.restore();
  } catch {}
  c.strokeStyle = '#86aba64d';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(934, 400, 224, 255, 0.45, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#d1f68a';
  c.font = '24px Arial, sans-serif';
  c.fillText('FLIGHT REPORT / ORBITAL DRIFT', 64, 80);
  c.fillStyle = '#edf4ec';
  c.font = 'bold 48px Arial, "PingFang SC", sans-serif';
  c.fillText(zh ? '近星轨道' : 'ORBITAL DRIFT', 64, 155);
  c.fillStyle = '#a7c1c1';
  c.font = '24px Arial, "PingFang SC", sans-serif';
  c.fillText(zh ? '本次生存时间' : 'SURVIVAL TIME', 64, 245);
  c.fillStyle = '#edf4ec';
  c.font = '108px monospace';
  c.fillText(scoreText(data.score), 58, 365);
  c.fillStyle = '#d1f68a';
  c.font = '28px Arial, "PingFang SC", sans-serif';
  c.fillText(
    data.achieved.length
      ? (zh ? '已达成 ' : 'Reached ') + data.achieved.map((s) => `${s}s`).join(' / ')
      : zh
        ? '下一目标：坚持 30 秒'
        : 'Next target: survive 30 seconds',
    64,
    430,
  );
  if (data.newRecord) {
    c.font = '22px Arial, "PingFang SC", sans-serif';
    c.fillText(zh ? '刷新本机纪录' : 'A NEW PERSONAL BEST', 64, 478);
  }
  c.fillStyle = '#dbe9e1';
  c.font = '32px Arial, "PingFang SC", sans-serif';
  c.fillText(zh ? '你能在轨道上坚持更久吗？' : 'How long can you hold your orbit?', 64, 590);
  c.fillStyle = '#8da6a8';
  c.font = '20px Arial, "PingFang SC", sans-serif';
  c.fillText(
    zh ? '转动船头 · 轻点推进 · 躲避陨石' : 'Turn your ship · Tap your thrusters · Dodge meteors',
    64,
    635,
  );
  if (data.url) {
    c.fillStyle = '#c4e799';
    c.font = '18px monospace';
    // Preserve every character of the real referral URL across measured lines.
    let line = '',
      y = 690;
    for (const ch of data.url) {
      if (c.measureText(line + ch).width > 1060) {
        c.fillText(line, 64, y);
        y += 24;
        line = '';
      }
      line += ch;
    }
    c.fillText(line, 64, y);
  }
  c.fillStyle = '#779195';
  c.font = '17px Arial, "PingFang SC", sans-serif';
  c.fillText(
    zh
      ? '本机飞行记录 · 屏幕尺寸影响玩法，不是跨设备排名'
      : 'A personal flight record · Play varies with screen size',
    64,
    835,
  );
  return canvasPng(canvas);
}
export async function systemShare(
  blob: Blob,
  data: CardData,
  nav: Pick<Navigator, 'share' | 'canShare'> = navigator,
) {
  return sharedSystemShare(
    blob,
    {
      gameId: 'orbital-drift',
      title: 'Orbital Drift · 近星轨道',
      text:
        data.language === 'zh'
          ? `我在近星轨道坚持了 ${scoreText(data.score)}，你呢？`
          : `I survived ${scoreText(data.score)} in Orbital Drift. Your turn!`,
      url: data.url,
      fileName: `orbital-drift-${Math.floor(data.score)}s.png`,
    },
    nav,
  );
}
