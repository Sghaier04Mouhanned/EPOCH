import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react';
import { notifyStatus, playRing, type NotifyStatus } from '../alerts/browser';
import { phaseDurationMs, type Phase, type Settings } from '../engine/pomodoro';
import type { BrowserApp } from '../app/browser';
import type { TimerSnapshot } from '../app/timerStore';
import { useAllSessions } from '../app/useAllSessions';
import { buildBackup, importSessions, parseBackup } from '../storage/backup';
import { PHASE_LABEL, formatDuration, plural } from './format';
import { usePresence } from './usePresence';

type NumberKey = 'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'longBreakEvery';

const FIELDS: { key: NumberKey; label: string; unit: string; min: number; max: number }[] = [
  { key: 'focusMinutes', label: 'Focus', unit: 'min', min: 1, max: 180 },
  { key: 'shortBreakMinutes', label: 'Short break', unit: 'min', min: 1, max: 60 },
  { key: 'longBreakMinutes', label: 'Long break', unit: 'min', min: 1, max: 90 },
  { key: 'longBreakEvery', label: 'Long break after', unit: 'sessions', min: 1, max: 12 },
];

const fileDate = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD
const lastDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** A quiet "Saved" stamp that shows for two seconds after each change. */
function useSavedStamp() {
  const [shown, setShown] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    shown,
    () => {
      setShown(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShown(false), 2000);
    },
  ] as const;
}

export function SettingsScreen({ app, snapshot }: { app: BrowserApp; snapshot: TimerSnapshot }) {
  const { settings, state } = snapshot;
  const running = state.countdown.status !== 'idle';

  return (
    <>
      <header className="title-row">
        <h1>Settings</h1>
        <p className="subline">Changes save as you make them.</p>
      </header>

      <SessionLengths app={app} settings={settings} running={running} />
      <AutoStart app={app} settings={settings} />
      <Alerts app={app} />
      <Backup app={app} settings={settings} />
      <DeleteHistory app={app} />
    </>
  );
}

function Section(props: { id: string; title: string; description: string; stamp?: boolean; children: ReactNode }) {
  const saved = usePresence(Boolean(props.stamp), 200);
  return (
    <section className="settings-row" aria-labelledby={props.id}>
      <div className="settings-label">
        <h2 id={props.id} className="settings-title">
          {props.title}
          {saved.mounted && (
            <span className={`saved${saved.leaving ? ' is-leaving' : ''}`} role="status">
              Saved
            </span>
          )}
        </h2>
        <p>{props.description}</p>
      </div>
      <div className="panel settings-panel">{props.children}</div>
    </section>
  );
}

function SessionLengths({ app, settings, running }: { app: BrowserApp; settings: Settings; running: boolean }) {
  const [saved, stamp] = useSavedStamp();
  // What is typed, kept separately so a half-typed or out-of-range value can be shown and corrected.
  const [draft, setDraft] = useState<Partial<Record<NumberKey, string>>>({});

  const change = (key: NumberKey, min: number, max: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraft((d) => ({ ...d, [key]: text }));
    const n = Number(text);
    if (text !== '' && Number.isInteger(n) && n >= min && n <= max && n !== settings[key]) {
      app.store.updateSettings({ [key]: n });
      stamp();
    }
  };

  return (
    <Section
      id="lengths-title"
      title="Session lengths"
      description={
        running
          ? 'The timer that is running keeps its length; changes apply from the next phase.'
          : 'How long each phase lasts, and how many focus sessions come before a long break.'
      }
      stamp={saved}
    >
      <div className="fields">
        {FIELDS.map((f) => {
          const text = draft[f.key] ?? String(settings[f.key]);
          const n = Number(text);
          const invalid = text === '' || !Number.isInteger(n) || n < f.min || n > f.max;
          return (
            <div key={f.key} className="field">
              <label htmlFor={f.key}>{f.label}</label>
              <div className={`input-unit${invalid ? ' is-invalid' : ''}`}>
                <input
                  id={f.key}
                  type="number"
                  inputMode="numeric"
                  min={f.min}
                  max={f.max}
                  step={1}
                  value={text}
                  onChange={change(f.key, f.min, f.max)}
                  onBlur={() => setDraft((d) => ({ ...d, [f.key]: undefined }))}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${f.key}-error` : undefined}
                />
                <span className="unit-suffix">{f.unit}</span>
              </div>
              {invalid && (
                <p id={`${f.key}-error`} className="field-error">
                  A whole number from {f.min} to {f.max}. Still using {settings[f.key]}.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <CyclePreview settings={settings} />
    </Section>
  );
}

/** What the lengths produce: one full cycle, drawn to scale. */
function CyclePreview({ settings }: { settings: Settings }) {
  const phases: Phase[] = [];
  for (let i = 0; i < settings.longBreakEvery; i++) {
    phases.push('focus', i === settings.longBreakEvery - 1 ? 'longBreak' : 'shortBreak');
  }
  const total = phases.reduce((sum, p) => sum + phaseDurationMs(p, settings), 0);
  const focus = settings.longBreakEvery * phaseDurationMs('focus', settings);

  return (
    <figure className="cycle" aria-label="One full cycle at these lengths">
      <figcaption className="cycle-caption">
        <span>One cycle</span>
        <span className="num">
          {formatDuration(total)}, {formatDuration(focus)} of it focus
        </span>
      </figcaption>
      <div className="cycle-strip">
        {phases.map((p, i) => (
          <span
            key={i}
            className={`cycle-block ${p === 'focus' ? 'block-focus' : 'block-break'}`}
            style={{ flexGrow: phaseDurationMs(p, settings) }}
            title={`${PHASE_LABEL[p]} · ${formatDuration(phaseDurationMs(p, settings))}`}
          />
        ))}
      </div>
    </figure>
  );
}

function AutoStart({ app, settings }: { app: BrowserApp; settings: Settings }) {
  const [saved, stamp] = useSavedStamp();
  const toggle = (key: 'autoStartBreaks' | 'autoStartFocus') => () => {
    app.store.updateSettings({ [key]: !settings[key] });
    stamp();
  };
  return (
    <Section
      id="auto-title"
      title="Auto-start"
      description="Start the next phase by itself when one ends, so you only press Start once."
      stamp={saved}
    >
      <Switch
        id="auto-breaks"
        title="Start breaks automatically"
        description="When a focus session ends, the break begins straight away."
        checked={settings.autoStartBreaks}
        onChange={toggle('autoStartBreaks')}
      />
      <Switch
        id="auto-focus"
        title="Start focus automatically"
        description="When a break ends, the next focus session begins straight away."
        checked={settings.autoStartFocus}
        onChange={toggle('autoStartFocus')}
      />
    </Section>
  );
}

function Switch(props: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="switch-row">
      <div>
        <label htmlFor={props.id} className="switch-title">
          {props.title}
        </label>
        <p id={`${props.id}-desc`} className="switch-desc">
          {props.description}
        </p>
      </div>
      <div className="switch-controls">
        {props.extra}
        <input
          id={props.id}
          type="checkbox"
          role="switch"
          className="switch"
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onChange}
          aria-describedby={`${props.id}-desc`}
        />
      </div>
    </div>
  );
}

const NOTIFY_HELP: Record<NotifyStatus, string> = {
  default: 'Shown when Epoch is in the background. Your browser asks for permission the first time.',
  granted: 'Shown when Epoch is in the background, or when the sound could not play.',
  denied: "Blocked for this site in your browser. Allow notifications in the site settings (the icon left of the address), then turn this on.",
  unsupported: "This browser can't show notifications from a web page. On iPhone, add Epoch to the Home Screen first.",
};

function Alerts({ app }: { app: BrowserApp }) {
  const prefs = useSyncExternalStore(app.alertPrefs.subscribe, app.alertPrefs.get);
  const [status, setStatus] = useState<NotifyStatus>(notifyStatus);
  const [saved, stamp] = useSavedStamp();
  const blocked = status === 'denied' || status === 'unsupported';

  const toggleNotify = async () => {
    if (prefs.notify) {
      app.alertPrefs.set({ notify: false });
      stamp();
      return;
    }
    const permission = status === 'default' ? await Notification.requestPermission() : status;
    setStatus(permission);
    if (permission === 'granted') {
      app.alertPrefs.set({ notify: true });
      stamp();
    }
  };

  return (
    <Section
      id="alerts-title"
      title="Alerts"
      description="How Epoch tells you a phase is over. Only one open tab alerts, however many you have."
      stamp={saved}
    >
      <Switch
        id="alert-sound"
        title="Play a sound"
        description="A single bell ring when focus or a break ends."
        checked={prefs.sound}
        onChange={() => {
          app.alertPrefs.set({ sound: !prefs.sound });
          stamp();
        }}
        extra={
          <button type="button" className="btn btn-text" onClick={() => void playRing()}>
            Play
          </button>
        }
      />
      <Switch
        id="alert-notify"
        title="Show a notification"
        description={NOTIFY_HELP[status]}
        checked={prefs.notify && status === 'granted'}
        disabled={blocked}
        onChange={() => void toggleNotify()}
      />
    </Section>
  );
}

type ImportResult = { kind: 'ok'; text: string } | { kind: 'error'; text: string };

function Backup({ app, settings }: { app: BrowserApp; settings: Settings }) {
  const history = useAllSessions(app);
  const [result, setResult] = useState<ImportResult>();
  const fileInput = useRef<HTMLInputElement>(null);
  const sessions = history.status === 'ready' ? history.data : [];
  const last = sessions.at(-1);

  const exportBackup = () => {
    const now = Date.now();
    const blob = new Blob([JSON.stringify(buildBackup(settings, sessions, now), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epoch-backup-${fileDate.format(now)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setResult({ kind: 'error', text: `${parsed.error} Nothing was changed.` });
      return;
    }
    try {
      const { added, alreadyHere } = await importSessions(app.sessions, parsed.sessions);
      app.store.updateSettings(parsed.settings);
      app.historyChanged();
      const parts = [
        `Added ${plural(added, 'session')}`,
        alreadyHere ? `${alreadyHere} ${alreadyHere === 1 ? 'was' : 'were'} already here` : '',
        parsed.skipped ? `${plural(parsed.skipped, 'unreadable entry', 'unreadable entries')} skipped` : '',
      ].filter(Boolean);
      setResult({ kind: 'ok', text: `${parts.join('; ')}. Timer settings restored from the backup.` });
    } catch {
      setResult({ kind: 'error', text: "Couldn't save to this browser's storage. Nothing was imported." });
    }
  };

  return (
    <Section
      id="backup-title"
      title="Backup"
      description="Your history lives only in this browser. Export it to keep a copy or to move it to another device."
    >
      <div className="backup-row">
        <div>
          <p className="switch-title">Export</p>
          <p className="switch-desc num">
            {history.status === 'loading'
              ? 'Counting sessions…'
              : sessions.length
                ? `${plural(sessions.length, 'session')}, the last on ${lastDate.format(last!.startedAt)}`
                : 'No sessions yet. The file will hold your settings only.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportBackup} disabled={history.status !== 'ready'}>
          Download backup
        </button>
      </div>
      <div className="backup-row">
        <div>
          <p className="switch-title">Import</p>
          <p className="switch-desc">Adds the sessions in an Epoch backup file. Sessions you already have are not doubled.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
          Choose file…
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBackup} />
      </div>
      {result && (
        <p className={result.kind === 'error' ? 'notice notice-error' : 'notice'} role="status">
          {result.text}
        </p>
      )}
    </Section>
  );
}

function DeleteHistory({ app }: { app: BrowserApp }) {
  const history = useAllSessions(app);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const count = history.status === 'ready' ? history.data.length : 0;

  const remove = async () => {
    await app.sessions.clear();
    app.historyChanged();
    setConfirming(false);
    setDone(true);
  };

  return (
    <Section
      id="delete-title"
      title="Delete history"
      description="Removes every recorded session from this browser. Your settings and a running timer stay."
    >
      {confirming ? (
        <div className="confirm">
          <p>
            This permanently deletes {plural(count, 'session')} from this browser. It can't be undone; download a
            backup first if you might want them back.
          </p>
          <div className="controls">
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete {plural(count, 'session')}
            </button>
            <button type="button" className="btn btn-text" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="backup-row">
          <p className="switch-desc">
            {done && count === 0 ? 'History deleted.' : count ? `${plural(count, 'session')} recorded.` : 'Nothing recorded yet.'}
          </p>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setDone(false);
              setConfirming(true);
            }}
            disabled={count === 0}
          >
            Delete all history…
          </button>
        </div>
      )}
    </Section>
  );
}
