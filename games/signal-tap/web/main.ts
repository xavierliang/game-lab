import './style.css';
import game from '../game.json';
import { Analytics, id } from '@game-lab/services/analytics';
import { releaseConfig } from '@game-lab/services/config';
import { referralLink, simpleScoreCard, systemShare, copyLink } from '@game-lab/services/sharing';
const $ = <T extends HTMLElement = HTMLElement>(name: string) => document.getElementById(name) as T;
const config = releaseConfig({
    gameId: game.id,
    gameVersion: game.version,
    example: game.status === 'example',
  }),
  metrics = new Analytics(config, 'zh');
let mode: 'ready' | 'playing' | 'paused' | 'over' = 'ready',
  hits = 0,
  elapsed = 0,
  index = 0,
  run = '',
  last = 0,
  best = 0,
  card: Blob | null = null,
  cardUrl = '',
  shareId = '',
  shareUrl = '';
try {
  best = Number(localStorage.getItem('game-lab:signal-tap:best')) || 0;
} catch {}
function update() {
  $('score').textContent = `${hits} / 10`;
  $('time').textContent = elapsed.toFixed(1) + 's';
  $('mode').textContent = {
    ready: '准备开始',
    playing: '点击亮起的信号',
    paused: '已暂停，准备好了再继续',
    over: '十次信号，全部捕获！',
  }[mode];
  $('milestone').textContent = hits >= 5 ? '✓ 达成阶段：五次信号' : '阶段目标：点击 5 次';
  $<HTMLButtonElement>('signal').disabled = mode !== 'playing';
  $<HTMLButtonElement>('pause').disabled = mode === 'ready' || mode === 'over';
  $('pause').textContent = mode === 'paused' ? '继续' : '暂停';
  $('start').textContent = mode === 'ready' ? '开始' : '重新开始';
  $('share').hidden = mode !== 'over';
  $('best').textContent = best ? ` 已完成 ${best} 轮。` : '';
}
function pause(reason = 'manual') {
  if (mode === 'playing') {
    mode = 'paused';
    metrics.event('pause', { run_id: run, score: hits, reason });
    update();
  }
}
$('start').onclick = () => {
  if (mode === 'playing' || mode === 'paused')
    metrics.event('run_abandon', { run_id: run, score: hits, reason: 'restart' });
  mode = 'playing';
  run = id();
  index++;
  hits = elapsed = 0;
  last = 0;
  $('sharing').hidden = true;
  metrics.event('run_start', { run_id: run, score: 0, index });
  update();
};
$('pause').onclick = () => {
  if (mode === 'playing') pause();
  else if (mode === 'paused') {
    mode = 'playing';
    last = 0;
    metrics.event('resume', { run_id: run, score: hits });
    update();
  }
};
$('signal').onclick = () => {
  if (mode !== 'playing') return;
  hits++;
  if (hits === 5) metrics.event('milestone', { run_id: run, score: hits, milestone: 'five-hits' });
  if (hits === 10) {
    mode = 'over';
    best++;
    try {
      localStorage.setItem('game-lab:signal-tap:best', String(best));
    } catch {}
    metrics.event('run_end', { run_id: run, score: hits, outcome: 'completed', new_record: false });
  }
  update();
};
window.addEventListener('blur', () => pause('background'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause('background');
});
function tick(now: number) {
  if (mode === 'playing' && !document.hidden) {
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0;
    elapsed += dt;
    metrics.advancePlay(dt);
    $('time').textContent = elapsed.toFixed(1) + 's';
  }
  last = now;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
$('share').onclick = async () => {
  shareId = id();
  shareUrl = referralLink(config, shareId);
  metrics.event('share_open', { share_id: shareId });
  $('sharing').hidden = false;
  $('share-status').textContent = '正在生成 PNG…';
  try {
    card = await simpleScoreCard({
      title: '信号点击 / SIGNAL TAP',
      score: `${hits} / 10`,
      detail: `本轮用时 ${elapsed.toFixed(1)} 秒 · 五次信号阶段已达成`,
      invitation: '来试试捕获十次信号。',
      url: shareUrl,
    });
    if (cardUrl) URL.revokeObjectURL(cardUrl);
    cardUrl = URL.createObjectURL(card);
    $<HTMLImageElement>('preview').src = cardUrl;
    $<HTMLAnchorElement>('download').href = cardUrl;
    $<HTMLButtonElement>('system').disabled = false;
    $('copy').hidden = $('link').hidden = !shareUrl;
    $<HTMLInputElement>('link').value = shareUrl;
    $('share-status').textContent = shareUrl ? '' : '正式链接尚未配置，可先保存 PNG。';
    metrics.event('card_ready', { share_id: shareId });
  } catch {
    $('share-status').textContent = 'PNG 生成失败，请重试。';
    metrics.event('card_error', { share_id: shareId });
  }
};
$('system').onclick = async () => {
  if (!card) return;
  metrics.event('share_intent', { share_id: shareId });
  const result = await systemShare(card, {
    gameId: game.id,
    title: '信号点击',
    text: '我捕获了十次信号，你也来试试。',
    url: shareUrl,
  });
  metrics.event(`share_${result.outcome}`, { share_id: shareId, method: result.method });
  $('share-status').textContent = {
    complete: '系统分享操作已完成，不代表对方已打开。',
    cancel: '分享取消或没有可用目标。',
    fallback: '请下载 PNG 或复制链接。',
    error: '系统分享不可用，请使用下载或复制。',
  }[result.outcome];
};
$('download').onclick = () => metrics.event('card_download', { share_id: shareId });
$('copy').onclick = async () => {
  const ok = await copyLink(shareUrl);
  metrics.event(ok ? 'link_copy' : 'link_copy_error', { share_id: shareId });
  $('share-status').textContent = ok ? '链接已复制。' : '请选中下方链接手动复制。';
};
$<HTMLInputElement>('link').onfocus = (e) => (e.target as HTMLInputElement).select();
$<HTMLInputElement>('tracking').checked = metrics.enabled;
$<HTMLInputElement>('tracking').disabled = !config.analyticsEndpoint;
$('tracking').onchange = (e) => metrics.setEnabled((e.target as HTMLInputElement).checked);
metrics.event('load_success');
update();
