import { AppShell, Checkbox, Field } from '@tools/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { beep, notify, notifyState, requestNotifications, unlockAudio, type NotifyState } from './alerts';
import {
  cdDue, cdFinish, cdPause, cdRemaining, cdReset, cdStart, formatDuration, formatRemaining, lapRows, newCountdown, newStopwatch,
  parseSaved, settleOnLoad, swElapsed, swLap, swPause, swReset, swRunning, swStart, toMs, type Countdown, type Saved,
} from './clock';

const KEY = 'time-taker:v1';
const BASE_TITLE = 'Time Taker';

function load(): Saved {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked: start fresh
  }
  const saved = parseSaved(raw);
  const now = Date.now();
  return saved
    ? { ...saved, timers: saved.timers.map((t) => settleOnLoad(t, now)) }
    : { stopwatch: newStopwatch(), timers: [], sound: true };
}

type Tab = 'stopwatch' | 'timers';

export function App() {
  const [state, setState] = useState<Saved>(load);
  const stateRef = useRef(state);
  const [now, setNow] = useState(Date.now);
  const [tab, setTab] = useState<Tab>('stopwatch');
  const [notif, setNotif] = useState<NotifyState>(notifyState);
  const [form, setForm] = useState({ label: '', h: 0, m: 5, s: 0 });
  const labelInput = useRef<HTMLInputElement>(null);
  const nextNumber = useRef(state.timers.length + 1);

  const commit = useCallback((update: (s: Saved) => Saved) => {
    stateRef.current = update(stateRef.current);
    setState(stateRef.current);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage unavailable: timers just won't persist
    }
  }, [state]);

  // Finish due timers and alert once. Driven by wall-clock time, so a late tick is still correct.
  const check = useCallback(
    (at: number) => {
      const due = stateRef.current.timers.filter((t) => cdDue(t, at));
      if (due.length === 0) return;
      commit((s) => ({ ...s, timers: s.timers.map((t) => (cdDue(t, at) ? cdFinish(t) : t)) }));
      if (stateRef.current.sound) beep();
      for (const t of due) notify(`${t.label} finished`, `Your ${formatDuration(t.duration)} timer is done.`);
    },
    [commit],
  );

  useEffect(() => {
    const tick = (at: number) => {
      check(at);
      if (!document.hidden) setNow(at);
    };
    let worker: Worker | null = null;
    let fallback: number | undefined;
    try {
      worker = new Worker(new URL('./ticker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<number>) => tick(e.data);
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        fallback = window.setInterval(() => tick(Date.now()), 250);
      };
    } catch {
      fallback = window.setInterval(() => tick(Date.now()), 250);
    }
    const onVisible = () => tick(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      worker?.terminate();
      window.clearInterval(fallback);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const sw = state.stopwatch;
  const finished = state.timers.filter((t) => t.status === 'finished');
  const running = state.timers.filter((t) => t.status === 'running');

  useEffect(() => {
    if (finished.length > 0) document.title = `⏰ ${finished[0]!.label} done · ${BASE_TITLE}`;
    else if (running.length > 0) document.title = `${formatRemaining(Math.min(...running.map((t) => cdRemaining(t, now))))} · ${BASE_TITLE}`;
    else document.title = BASE_TITLE;
  });

  const toggleStopwatch = useCallback(() => {
    unlockAudio();
    const at = Date.now();
    commit((s) => ({ ...s, stopwatch: swRunning(s.stopwatch) ? swPause(s.stopwatch, at) : swStart(s.stopwatch, at) }));
    setNow(at);
  }, [commit]);
  const lap = useCallback(() => commit((s) => ({ ...s, stopwatch: swLap(s.stopwatch, Date.now()) })), [commit]);
  const resetStopwatch = useCallback(() => commit((s) => ({ ...s, stopwatch: swReset() })), [commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea, select, button, a, [role=tab]')) return;
      const k = e.key.toLowerCase();
      if (k === '1') setTab('stopwatch');
      else if (k === '2') setTab('timers');
      else if (k === 'n') {
        e.preventDefault();
        setTab('timers');
        setTimeout(() => labelInput.current?.focus(), 0);
      } else if (tab === 'stopwatch') {
        if (k === ' ') {
          e.preventDefault();
          toggleStopwatch();
        } else if (k === 'l') lap();
        else if (k === 'r') resetStopwatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, toggleStopwatch, lap, resetStopwatch]);

  const addTimer = (e: FormEvent, preset?: number) => {
    e.preventDefault();
    const duration = preset ?? toMs(form.h, form.m, form.s);
    if (duration <= 0) return;
    const label = (preset ? '' : form.label.trim()) || `Timer ${nextNumber.current}`;
    nextNumber.current++;
    commit((s) => ({ ...s, timers: [...s.timers, newCountdown(crypto.randomUUID(), label, duration)] }));
  };
  const change = useCallback(
    (id: string, fn: (t: Countdown, at: number) => Countdown) => {
      unlockAudio();
      const at = Date.now();
      commit((s) => ({ ...s, timers: s.timers.map((t) => (t.id === id ? fn(t, at) : t)) }));
      setNow(at);
    },
    [commit],
  );

  const rows = lapRows(sw).reverse();
  const elapsed = swElapsed(sw, now);

  return (
    <AppShell
      title="Time Taker"
      tagline="A stopwatch with laps, plus as many countdown timers as you need."
      privacy="Runs entirely in your browser. Nothing is sent anywhere; timers are saved only in this browser's local storage."
      howTo={[
        'Use the Stopwatch tab for timing with laps, or the Timers tab to set one or more countdowns.',
        'Timers keep correct time even when this tab is in the background, and survive a reload.',
        'Turn on sound and notifications below to be alerted when a timer ends. Keyboard: 1 and 2 switch tabs, Space starts or pauses, L laps, R resets, N adds a timer.',
      ]}
    >
      <div role="tablist" aria-label="Mode" className="row" style={{ marginBottom: '1rem' }}>
        {(['stopwatch', 'timers'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            className={`btn${tab === t ? ' primary' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'stopwatch' ? 'Stopwatch' : `Timers${state.timers.length ? ` (${state.timers.length})` : ''}`}
          </button>
        ))}
      </div>

      <section id="panel-stopwatch" role="tabpanel" aria-labelledby="tab-stopwatch" hidden={tab !== 'stopwatch'} className="card">
        <p className="readout mono" role="timer" aria-label="Stopwatch">{formatDuration(elapsed, true)}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={toggleStopwatch}>
            {swRunning(sw) ? 'Pause' : sw.accumulated > 0 ? 'Resume' : 'Start'}
          </button>
          <button type="button" className="btn" onClick={lap} disabled={!swRunning(sw)}>Lap</button>
          <button type="button" className="btn danger" onClick={resetStopwatch} disabled={elapsed === 0 && sw.laps.length === 0}>Reset</button>
        </div>
        {rows.length > 0 && (
          <table className="laps">
            <caption className="sr-only">Laps</caption>
            <thead>
              <tr><th scope="col">Lap</th><th scope="col">Split</th><th scope="col">Total</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number}>
                  <th scope="row">{r.number}</th>
                  <td className="mono">{formatDuration(r.split, true)}</td>
                  <td className="mono">{formatDuration(r.total, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section id="panel-timers" role="tabpanel" aria-labelledby="tab-timers" hidden={tab !== 'timers'}>
        <form className="card" onSubmit={addTimer} aria-label="New timer">
          <h2>New timer</h2>
          <div className="row">
            <Field label="Name">{(id) => <input id={id} ref={labelInput} type="text" value={form.label} placeholder="Tea" onChange={(e) => setForm({ ...form, label: e.target.value })} />}</Field>
            {(['h', 'm', 's'] as const).map((unit) => (
              <Field key={unit} label={{ h: 'Hours', m: 'Minutes', s: 'Seconds' }[unit]}>
                {(id) => <input id={id} type="number" min={0} max={unit === 'h' ? 99 : 59} value={form[unit]} onChange={(e) => setForm({ ...form, [unit]: Number(e.target.value) })} style={{ width: 90 }} />}
              </Field>
            ))}
          </div>
          <div className="row">
            <button type="submit" className="btn primary" disabled={toMs(form.h, form.m, form.s) <= 0}>Add timer</button>
            <span className="muted small">Quick add:</span>
            {[1, 5, 10, 25].map((m) => (
              <button key={m} type="button" className="btn small" onClick={(e) => addTimer(e, m * 60_000)}>{m} min</button>
            ))}
          </div>
        </form>
        {state.timers.length === 0 && <p className="muted">No timers yet. Add one above.</p>}
        <ul className="files">
          {state.timers.map((t) => {
            const left = cdRemaining(t, now);
            return (
              <li key={t.id} className="card timer" data-status={t.status}>
                <div className="row spread">
                  <strong>{t.label}</strong>
                  <span className="muted small">{formatDuration(t.duration)} · {t.status === 'finished' ? 'Finished' : t.status === 'running' ? 'Running' : t.status === 'paused' ? 'Paused' : 'Ready'}</span>
                </div>
                <p className="readout mono" role="timer" aria-label={`${t.label} remaining`}>{formatRemaining(left)}</p>
                <div className="progress" aria-hidden="true"><div style={{ width: `${t.duration ? (1 - left / t.duration) * 100 : 100}%` }} /></div>
                <div className="row" style={{ marginTop: '.6rem' }}>
                  {t.status === 'running' ? (
                    <button type="button" className="btn" onClick={() => change(t.id, cdPause)}>Pause</button>
                  ) : (
                    <button type="button" className="btn primary" onClick={() => change(t.id, cdStart)}>{t.status === 'finished' ? 'Restart' : t.status === 'paused' ? 'Resume' : 'Start'}</button>
                  )}
                  <button type="button" className="btn" onClick={() => change(t.id, cdReset)} disabled={t.status === 'idle'}>Reset</button>
                  <button type="button" className="btn danger" onClick={() => commit((s) => ({ ...s, timers: s.timers.filter((x) => x.id !== t.id) }))} aria-label={`Delete ${t.label}`}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-label="Alerts">
        <h2>Alerts</h2>
        <Checkbox label="Play a sound when a timer ends" checked={state.sound} onChange={(v) => commit((s) => ({ ...s, sound: v }))} />
        <div className="row">
          <button type="button" className="btn small" onClick={() => { unlockAudio(); beep(); }}>Test sound</button>
          {notif === 'unsupported' ? (
            <span className="muted small">Desktop notifications are not supported by this browser.</span>
          ) : notif === 'granted' ? (
            <span className="muted small">Notifications are on.</span>
          ) : notif === 'denied' ? (
            <span className="muted small">Notifications are blocked. Allow them in your browser's site settings for this page.</span>
          ) : (
            <button type="button" className="btn small" onClick={async () => setNotif(await requestNotifications())}>Enable notifications</button>
          )}
        </div>
      </section>
    </AppShell>
  );
}
