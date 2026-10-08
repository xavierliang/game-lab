'use client';
import { copyLink } from '@game-lab/services/sharing';
import { useEffect, useState } from 'react';
import { scoreCard, systemShare, type CardData } from '../lib/score-card';
import { growthCopy } from '../lib/growth-copy';
import type { Analytics, EventName } from '../lib/analytics';
export function ScoreShare({ data, analytics }: { data: CardData; analytics: Analytics | null }) {
  const t = growthCopy[data.language];
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const event = (type: EventName, method?: string) =>
    analytics?.event(type, { share_id: data.shareId, method });
  useEffect(() => {
    let active = true,
      url = '';
    event('share_open');
    void scoreCard(data)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
        event('card_ready');
      })
      .catch(() => {
        if (active) {
          setStatus(t.cardError);
          event('card_error');
        }
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data]);
  const share = async () => {
    if (!card || busy) return;
    setBusy(true);
    event('share_intent');
    const result = await systemShare(card.blob, data);
    event(`share_${result.outcome}` as EventName, result.method);
    setStatus(
      result.outcome === 'complete'
        ? t.complete
        : result.outcome === 'cancel'
          ? t.cancel
          : t.fallback,
    );
    setBusy(false);
  };
  const copy = async () => {
    if (await copyLink(data.url)) {
      event('link_copy');
      setStatus(t.copied);
    } else {
      event('link_copy_error');
      setStatus(t.copyError);
    }
  };
  return (
    <div className="score-share">
      {card ? (
        <img
          className="score-preview"
          src={card.url}
          alt={data.language === 'zh' ? '本次飞行 PNG 成绩卡' : 'PNG of this flight’s score'}
        />
      ) : (
        <p>{status || t.preparing}</p>
      )}
      {card && (
        <div className="share-actions">
          <button className="dialog-action" onClick={share} disabled={busy}>
            {t.system}
          </button>
          <a
            className="dialog-action"
            href={card.url}
            download={`orbital-drift-${Math.floor(data.score)}s.png`}
            onClick={() => {
              event('card_download');
              setStatus(t.downloaded);
            }}
          >
            {t.download}
          </a>
        </div>
      )}
      {data.url ? (
        <>
          <button className="dialog-action" onClick={copy}>
            {t.link}
          </button>
          <input
            className="share-url"
            aria-label={t.link}
            value={data.url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      ) : (
        <p className="dialog-note">{t.noLink}</p>
      )}
      <p role="status">{status}</p>
      <p className="dialog-note">{t.fair}</p>
    </div>
  );
}
