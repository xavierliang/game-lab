export type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  referral: string;
  evidence: 'query' | 'referrer_query' | 'referrer_origin' | 'unknown';
};
export const campaignValue = (v: string | null) =>
  v && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(v) ? v : '';
export function attribution(url: string, referrer: string): Attribution {
  const p = new URL(url).searchParams;
  const a: Attribution = {
    source: campaignValue(p.get('utm_source') || p.get('source')),
    medium: campaignValue(p.get('utm_medium') || p.get('medium')),
    campaign: campaignValue(p.get('utm_campaign') || p.get('campaign')),
    content: campaignValue(p.get('utm_content') || p.get('content')),
    referral: campaignValue(p.get('ref')),
    evidence: 'unknown',
  };
  if (Object.values(a).some((v, i) => i < 5 && v)) {
    a.source ||= a.referral ? 'player' : 'unknown';
    a.evidence = 'query';
    return a;
  }
  // Public itch.io sample (2026-10-06) exposed the outer query in referrer,
  // although not in iframe.src. This is conditional browser evidence, not a
  // platform guarantee. Only extract campaign labels; never retain full URLs.
  try {
    const r = new URL(referrer),
      h = r.hostname;
    if (r.protocol === 'https:' && (h === 'itch.io' || h.endsWith('.itch.io'))) {
      const observed = attribution(r.href, '');
      if (observed.evidence === 'query') return { ...observed, evidence: 'referrer_query' };
      a.source = 'itch.io';
      a.medium = 'embed';
      a.evidence = 'referrer_origin';
    } else if (h && h !== new URL(url).hostname) {
      a.source = 'external';
      a.medium = 'referrer';
      a.evidence = 'referrer_origin';
    }
  } catch {}
  a.source ||= 'unknown';
  return a;
}
