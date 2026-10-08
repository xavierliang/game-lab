'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Orbit,
  Crosshair,
  SlidersHorizontal,
  X,
  Maximize,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { OrbitGame, MILESTONES, type GameSnapshot } from '../lib/orbit-game';
import {
  FlightAudio,
  readAudioSettings,
  type AudioSettings,
  type AudioStatus,
} from '../lib/flight-audio';
import { copy } from '../lib/copy';
import { registerGameTools } from '../lib/game-tools';
import { Analytics, id } from '../lib/analytics';
import { releaseConfig, VERSION, type ReleaseConfig } from '../lib/release-config';
import { growthCopy } from '../lib/growth-copy';
import { referralLink, type CardData } from '../lib/score-card';
import { ScoreShare } from '../components/score-share';
const initial: GameSnapshot = {
  mode: 'ready',
  time: 0,
  best: 0,
  speed: 0,
  altitude: 150,
  danger: '',
  thrust: false,
  reason: '',
  cause: '',
  warning: '',
  runId: '',
  achieved: [],
  newRecord: false,
};
function clock(s: number) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<OrbitGame | null>(null);
  const audio = useRef<FlightAudio | null>(null);
  const analytics = useRef<Analytics | null>(null);
  const config = useRef<ReleaseConfig | null>(null);
  const [tracking, setTracking] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [notice, setNotice] = useState(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [settings, setSettings] = useState<AudioSettings>({
    music: 0.5,
    effects: 0.55,
    muted: false,
  });
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('loading');
  const [guide, setGuide] = useState(true);
  const [panel, setPanel] = useState<'settings' | 'help' | 'credits' | 'share' | 'privacy' | null>(
    null,
  );
  const [fullscreenError, setFullscreenError] = useState(false);
  const t = copy[language],
    g = growthCopy[language];
  const nextMilestone = MILESTONES.find((s) => !state.achieved.includes(s));
  useEffect(() => {
    if (!canvas.current) return;
    let active = true;
    let lang: 'en' | 'zh' = navigator.language.startsWith('zh') ? 'zh' : 'en';
    try {
      const saved = localStorage.getItem('orbital-drift-language');
      if (saved === 'en' || saved === 'zh') lang = saved;
    } catch {}
    setLanguage(lang);
    const cfg = releaseConfig();
    config.current = cfg;
    const metrics = new Analytics(cfg, lang);
    analytics.current = metrics;
    metrics.language = lang;
    setTracking(metrics.enabled);
    const preferences = readAudioSettings();
    setSettings(preferences);
    const sound = new FlightAudio(preferences, (value) => {
      if (active) setAudioStatus(value);
    });
    audio.current = sound;
    let instance: OrbitGame;
    try {
      instance = new OrbitGame(
        canvas.current,
        (value) => {
          if (active) setState(value);
        },
        {
          audio: sound,
          onSimulation: (seconds) => metrics.advancePlay(seconds),
          onEvent: (event) => {
            metrics.event(event.type, event.data);
            if (event.type === 'run_start') {
              setNotice(0);
              clearTimeout(noticeTimer.current);
            }
            if (event.type === 'milestone') {
              setNotice(event.data.milestone!);
              clearTimeout(noticeTimer.current);
              noticeTimer.current = setTimeout(() => {
                if (active) setNotice(0);
              }, 4000);
            }
          },
        },
      );
    } catch {
      setError(true);
      metrics.event('load_error');
      sound.destroy();
      return () => {
        active = false;
        metrics.destroy();
      };
    }
    game.current = instance;
    instance.language = lang;
    let unregister = () => {};
    instance
      .load()
      .then(() => {
        if (active) {
          setLoaded(true);
          metrics.event('load_success');
          unregister = registerGameTools(instance);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          metrics.event('load_error');
        }
      });
    return () => {
      active = false;
      clearTimeout(noticeTimer.current);
      metrics.destroy();
      analytics.current = null;
      unregister();
      instance.destroy();
      game.current = null;
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    if (game.current) game.current.language = language;
    if (analytics.current) analytics.current.language = language;
  }, [language]);
  useEffect(() => {
    if (panel === 'privacy') setTracking(analytics.current?.enabled ?? false);
    if (panel) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
    if (game.current) game.current.controlsBlocked = !!panel;
  }, [panel]);
  const updateAudio = (next: AudioSettings) => {
    setSettings(next);
    audio.current?.setSettings(next);
  };
  const toggleMute = () => updateAudio({ ...settings, muted: !settings.muted });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyM' ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target as HTMLElement).matches('input,select,textarea')
      )
        return;
      event.preventDefault();
      toggleMute();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const changeLanguage = (value: 'en' | 'zh') => {
    setLanguage(value);
    try {
      localStorage.setItem('orbital-drift-language', value);
    } catch {}
  };
  const openPanel = (value: typeof panel) => {
    if (game.current?.snapshot().mode === 'playing') game.current.togglePause('settings');
    setPanel(value);
    setFullscreenError(false);
    audio.current?.click();
  };
  const openShare = () => {
    const shareId = id();
    setCardData({
      score: state.time,
      achieved: [...state.achieved],
      newRecord: state.newRecord,
      language,
      shareId,
      url: referralLink(config.current!, shareId),
    });
    openPanel('share');
  };
  const fullscreen = () => {
    if (!document.documentElement.requestFullscreen) {
      setFullscreenError(true);
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => setFullscreenError(true));
  };
  const touch = (key: 'left' | 'right' | 'thrust') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      game.current?.input(key, true);
    },
    onPointerUp: () => game.current?.input(key, false),
    onPointerCancel: () => game.current?.input(key, false),
    onLostPointerCapture: () => game.current?.input(key, false),
  });
  const paused = state.mode === 'paused',
    playing = state.mode === 'playing',
    ended = state.mode === 'over';
  const reason =
    state.cause === 'planet'
      ? t.planetDeath
      : state.cause === 'boundary'
        ? t.boundaryDeath
        : t.asteroidDeath;
  return (
    <main
      className={`game-shell ${state.mode === 'ready' ? 'is-ready' : 'is-flight'}`}
      data-mode={state.mode}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <canvas ref={canvas} className="space-canvas" aria-label={t.description} />
      <div className="screen-shade" aria-hidden="true" />
      <header className="topbar">
        <div className="wordmark">
          <Orbit size={30} strokeWidth={1.25} />
          <span>
            ORBITAL<span className="wordmark-light"> DRIFT</span>
            <small>{language === 'zh' ? '近 星 轨 道' : 'A GRAVITY SURVIVAL GAME'}</small>
          </span>
        </div>
        <div className="session-status">
          <span className={playing ? 'status-dot live' : 'status-dot'} />
          {playing ? t.playing : paused ? t.paused : ended ? t.ended : t.ready}
          <span className="status-divider" />
          KEPLER · 01
        </div>
        <div className="top-actions">
          <Button
            variant="ghost"
            className="guide-control"
            title={t.guide}
            aria-label={t.guide}
            aria-pressed={guide}
            onClick={() => {
              setGuide(!guide);
              if (game.current) game.current.showGuide = !guide;
            }}
          >
            <Orbit />
            <span className="guide-label">{t.guide}</span>
            <span className={guide ? 'toggle-indicator on' : 'toggle-indicator'} />
          </Button>
          <Button
            variant="ghost"
            className="icon-control"
            title={`${settings.muted ? t.unmute : t.mute} (M)`}
            aria-label={settings.muted ? t.unmute : t.mute}
            aria-pressed={settings.muted}
            onClick={toggleMute}
          >
            {settings.muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button
            variant="ghost"
            className="icon-control"
            title={paused ? t.resume : t.stop}
            aria-label={paused ? t.resume : t.stop}
            disabled={!playing && !paused}
            onClick={() => game.current?.togglePause()}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
          <Button
            variant="ghost"
            className="icon-control"
            title={t.settings}
            aria-label={t.settings}
            onClick={() => openPanel('settings')}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </header>
      <section className="flight-stats" aria-label={t.time}>
        <span className="eyebrow">{t.time}</span>
        <div className="time-number">
          {clock(state.time)}
          <span>.{Math.floor((state.time % 1) * 10)}</span>
        </div>
        <div className="best-time">
          <span className="small-dash" />
          {t.best} <b>{clock(state.best)}</b>
        </div>
        {(playing || paused) && (
          <div className="milestone-target">
            <span>{nextMilestone ? `${g.next} · ${nextMilestone}s` : g.all}</span>
            <progress
              aria-label={g.next}
              value={nextMilestone ? state.time : 120}
              max={nextMilestone || 120}
            />
            {notice > 0 && (
              <strong role="status">
                ✓ {g.reached} · {notice}s
              </strong>
            )}
          </div>
        )}
      </section>
      <aside className="sector-label" aria-hidden="true">
        <span>{t.gravity}</span>
        <div>
          <Crosshair size={15} /> K–01
        </div>
        <small>{t.planet}</small>
      </aside>
      {!playing && (
        <section
          className={`launch-panel ${state.mode === 'ready' ? '' : 'session-panel'}`}
          aria-labelledby="panel-title"
        >
          <div className="panel-index">
            <span />
            {ended ? 'FLIGHT REPORT' : paused ? 'FLIGHT PAUSED' : 'ORBITAL SURVIVAL / 01'}
          </div>
          <h1 id="panel-title">
            {ended ? (
              t.over
            ) : paused ? (
              t.pause
            ) : (
              <>
                {t.title}
                <br />
                <span>{t.subtitle}</span>
              </>
            )}
          </h1>
          <p>{ended ? reason : paused ? t.pauseText : t.description}</p>
          {ended && (
            <div className="end-score">
              <span>
                {t.thisFlight}
                <strong>{clock(state.time)}</strong>
              </span>
              <span>
                {t.best}
                <strong>{clock(state.best)}</strong>
              </span>
            </div>
          )}
          {ended && (
            <div className="flight-achievements">
              {state.newRecord && <strong>{g.record}</strong>}
              <span>
                {state.achieved.length
                  ? `${g.stages}: ${state.achieved.map((s) => `${s}s`).join(' · ')}`
                  : g.none}
              </span>
            </div>
          )}
          <Button
            className="launch-button"
            size="lg"
            disabled={!loaded || error}
            onClick={paused ? () => game.current?.togglePause() : () => game.current?.start()}
          >
            {ended ? <RotateCcw size={18} /> : <ArrowUp size={18} />}
            {error
              ? t.failed
              : !loaded
                ? t.loading
                : ended
                  ? t.again
                  : paused
                    ? t.resume
                    : t.launch}
            <span>{paused ? 'P' : '↵'}</span>
          </Button>
          {ended && (
            <button className="share-flight" onClick={openShare}>
              {g.share} ↗
            </button>
          )}
          {error ? (
            <button className="retry-link" onClick={() => location.reload()}>
              {t.retry}
            </button>
          ) : (
            <div className="launch-note">
              {paused ? t.pauseNote : ended ? t.replayNote : t.launchNote}
            </div>
          )}
          <div className="panel-links">
            <button onClick={() => openPanel('help')}>{t.controls}</button>
            <span>·</span>
            <button onClick={() => openPanel('credits')}>{t.credits}</button>
            <span>·</span>
            <button onClick={() => changeLanguage(language === 'zh' ? 'en' : 'zh')}>
              {language === 'zh' ? 'English' : '中文'}
            </button>
            <span>·</span>
            <button onClick={() => openPanel('privacy')}>{g.privacy}</button>
          </div>
        </section>
      )}
      {playing && state.warning && (
        <div className="flight-warning" role="status">
          <span />
          {state.warning === 'planet' ? t.planetWarning : t.boundaryWarning}
        </div>
      )}
      <aside className="telemetry" aria-label={t.telemetry}>
        <div className="telemetry-heading">
          <span className="status-dot" />
          {t.telemetry}
        </div>
        <div>
          <span>{t.speed}</span>
          <b>
            {Math.round(state.speed)} <small>m/s</small>
          </b>
        </div>
        <div>
          <span>{t.altitude}</span>
          <b>
            {Math.round(state.altitude)} <small>km</small>
          </b>
        </div>
        <div className="engine-row">
          <span>{t.engine}</span>
          <b className={state.thrust ? 'engine-on' : ''}>
            {state.thrust ? t.on : t.off}
            <i className={state.thrust ? 'burn-bars on' : 'burn-bars'}>
              <em />
              <em />
              <em />
              <em />
              <em />
            </i>
          </b>
        </div>
        <div className="telemetry-foot">{playing ? t.advice : t.setup}</div>
      </aside>
      <div className="touch-controls" aria-label={t.controls}>
        <div>
          <button aria-label={language === 'zh' ? '向左转动船头' : 'Turn left'} {...touch('left')}>
            <ArrowLeft />
          </button>
          <button
            aria-label={language === 'zh' ? '向右转动船头' : 'Turn right'}
            {...touch('right')}
          >
            <ArrowRight />
          </button>
        </div>
        <button className="touch-thrust" aria-label={t.thrust} {...touch('thrust')}>
          <ArrowUp />
          {t.thrust}
        </button>
      </div>
      {state.mode === 'ready' && (
        <footer className="flight-footer">
          <div className="key-guide">
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> {t.turn}
            </span>
            <span>
              <kbd>↑</kbd> {t.thrust}
            </span>
            <span className="extra-key">
              <kbd>P</kbd> {t.stop}
            </span>
            <span className="extra-key">
              <kbd>R</kbd> {t.restart}
            </span>
          </div>
          <span className="audio-hint">{t.audioNote}</span>
        </footer>
      )}
      <dialog
        ref={dialog}
        className="flight-dialog"
        aria-labelledby="dialog-title"
        onCancel={() => setPanel(null)}
        onClose={() => setPanel(null)}
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">ORBITAL DRIFT · v{VERSION}</span>
            <h2 id="dialog-title">
              {panel === 'help'
                ? t.controls
                : panel === 'credits'
                  ? t.credits
                  : panel === 'share'
                    ? g.share
                    : panel === 'privacy'
                      ? g.privacy
                      : t.settings}
            </h2>
          </div>
          <button
            className="dialog-close"
            aria-label={t.close}
            onClick={() => setPanel(null)}
            autoFocus
          >
            <X />
          </button>
        </div>
        {panel === 'settings' && (
          <>
            <div className="audio-setting">
              <label htmlFor="music-volume">{t.music}</label>
              <output>{Math.round(settings.music * 100)}%</output>
              <input
                id="music-volume"
                type="range"
                min="0"
                max="100"
                value={Math.round(settings.music * 100)}
                onChange={(e) => updateAudio({ ...settings, music: Number(e.target.value) / 100 })}
              />
            </div>
            <div className="audio-setting">
              <label htmlFor="effects-volume">{t.effects}</label>
              <output>{Math.round(settings.effects * 100)}%</output>
              <input
                id="effects-volume"
                type="range"
                min="0"
                max="100"
                value={Math.round(settings.effects * 100)}
                onChange={(e) =>
                  updateAudio({ ...settings, effects: Number(e.target.value) / 100 })
                }
                onPointerUp={() => audio.current?.click()}
                onKeyUp={() => audio.current?.click()}
              />
            </div>
            <button className="dialog-action" aria-pressed={settings.muted} onClick={toggleMute}>
              {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              {settings.muted ? t.unmute : t.mute}
              <kbd>M</kbd>
            </button>
            <p className="dialog-note">
              {settings.muted
                ? t.muted
                : audioStatus === 'unavailable'
                  ? t.audioUnavailable
                  : audioStatus === 'loading'
                    ? t.audioLoading
                    : t.audioNote}
            </p>
            <div className="language-setting">
              <label htmlFor="language">{t.language}</label>
              <select
                id="language"
                value={language}
                onChange={(e) => changeLanguage(e.target.value as 'en' | 'zh')}
              >
                <option value="en">English</option>
                <option value="zh">简体中文</option>
              </select>
            </div>
            <button className="dialog-action" onClick={fullscreen}>
              <Maximize size={18} />
              {t.fullscreen}
            </button>
            {fullscreenError && (
              <p role="status" className="dialog-note">
                {t.fullscreenFail}
              </p>
            )}
            <div className="dialog-links">
              <button onClick={() => setPanel('privacy')}>{g.privacy}</button>
              <button onClick={() => setPanel('help')}>{t.controls}</button>
              <button onClick={() => setPanel('credits')}>{t.credits}</button>
            </div>
          </>
        )}
        {panel === 'share' && cardData && (
          <ScoreShare key={cardData.shareId} data={cardData} analytics={analytics.current} />
        )}
        {panel === 'privacy' && (
          <>
            <p>{g.privacyText}</p>
            <label className="privacy-toggle">
              <input
                type="checkbox"
                checked={tracking}
                disabled={!config.current?.analyticsEndpoint}
                onChange={(e) => {
                  analytics.current?.setEnabled(e.target.checked);
                  setTracking(e.target.checked);
                }}
              />
              {g.tracking}
            </label>
            <p role="status">
              {!config.current?.analyticsEndpoint ? g.disabled : tracking ? g.active : g.off}
            </p>
            {config.current?.environment === 'test' && <p className="dialog-note">{g.test}</p>}
            <p className="dialog-note">{g.local}</p>
            {config.current?.officialUrl && (
              <a href={config.current.officialUrl} target="_blank" rel="noreferrer">
                {g.openGame} ↗
              </a>
            )}
          </>
        )}
        {panel === 'help' && (
          <>
            <ol className="flight-steps">
              {[
                [t.step1, t.detail1],
                [t.step2, t.detail2],
                [t.step3, t.detail3],
              ].map(([title, detail]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </li>
              ))}
            </ol>
            <p>{t.touch}</p>
            <p className="dialog-note">{t.background}</p>
          </>
        )}
        {panel === 'credits' && (
          <div className="credit-copy">
            <h3>{t.attribution}</h3>
            <p>
              {t.musicCredit}{' '}
              <a
                href="https://opengameart.org/content/outer-space-loop"
                target="_blank"
                rel="noreferrer"
              >
                wipics ↗
              </a>
            </p>
            <p>
              {t.effectsCredit}{' '}
              <a href="https://kenney.nl/assets/sci-fi-sounds" target="_blank" rel="noreferrer">
                Kenney ↗
              </a>
            </p>
            <p>
              <a href="./licenses/CC0-1.0.txt" target="_blank" rel="noreferrer">
                {t.license}
              </a>
            </p>
            <p>{t.art}</p>
            <p className="dialog-note">{t.local}</p>
            <button className="dialog-action" onClick={() => setPanel('privacy')}>
              {g.privacy}
            </button>
          </div>
        )}
      </dialog>
    </main>
  );
}
