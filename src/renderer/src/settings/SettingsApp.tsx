import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, CircleCheck, Download, ExternalLink, FileText, Info, RefreshCw, RotateCcw, Settings2, Sparkles, Type } from 'lucide-react';
import { RELEASES_URL, WEBSITE_URL, releaseNotesUrl } from '../../../shared/product';
import { shortcutLabels } from '../../../shared/shortcuts';
import { defaultSlideAppearance, DEFAULT_NDI_NAME, lyricsStyleFor, NDI_NAME_PATTERN, SLIDE_FONTS, SLIDE_PRESETS, type SlideAppearance } from '../../../shared/settings';
import type { AppSnapshot, UpdateStatus } from '../../../shared/types';
import { LyricsStage } from '../components/LyricsStage';
import logoUrl from '../assets/logo.svg';
import { call, run } from '../lib/api';
import { notify, useNotification, useSnapshot } from '../lib/stores';

type Section = 'general' | 'slides' | 'updates' | 'about';

const SECTIONS: Array<{ id: Section; label: string; icon: ReactNode }> = [
  { id: 'general', label: 'General', icon: <Settings2 size={16} /> },
  { id: 'slides', label: 'Slides', icon: <Type size={16} /> },
  { id: 'updates', label: 'Updates', icon: <Sparkles size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> }
];

function sectionFromHash(): Section {
  const hash = window.location.hash.replace('#', '');
  return hash === 'slides' || hash === 'updates' || hash === 'about' ? hash : 'general';
}

/** The Settings window: preferences, in-app updates and version information. */
export function SettingsApp() {
  const snap = useSnapshot();
  const notification = useNotification();
  const [section, setSection] = useState<Section>(sectionFromHash);

  useEffect(() => window.vrs.on('app:settingsSection', (s) => setSection(s)), []);

  if (!snap) return <div className="starting">Loading…</div>;
  const updateReady = snap.update.state === 'downloaded' || (snap.update.state === 'available' && snap.update.mode !== 'disabled');

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button key={s.id} className={s.id === section ? 'active' : ''} aria-current={s.id === section ? 'page' : undefined} onClick={() => setSection(s.id)}>
            {s.icon}
            {s.label}
            {s.id === 'updates' && updateReady ? <span className="dot" aria-label="Update available" /> : null}
          </button>
        ))}
        <div className="grow" />
        <div className="settings-version faint small">Version {snap.version}</div>
      </nav>
      <main className="settings-main">
        {section === 'general' ? <General snap={snap} /> : null}
        {section === 'slides' ? <Slides snap={snap} /> : null}
        {section === 'updates' ? <Updates snap={snap} /> : null}
        {section === 'about' ? <About snap={snap} /> : null}
        {notification ? (
          <div className={`settings-toast ${notification.level}`} role="status">
            {notification.message}
          </div>
        ) : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Group({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="group">
      <h2>{title}</h2>
      <div className="group-body">{children}</div>
      {note ? <p className="group-note">{note}</p> : null}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{label}</div>
        {hint ? <div className="row-hint">{hint}</div> : null}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* ------------------------------------------------------------------ */
/* General                                                             */
/* ------------------------------------------------------------------ */

function General({ snap }: { snap: AppSnapshot }) {
  const keys = shortcutLabels(snap.platform);
  const [updatingLists, setUpdatingLists] = useState(false);

  const updateLists = () => {
    setUpdatingLists(true);
    call('adblock:update')
      .then(() => notify('success', 'Ad-blocking lists updated.'))
      .catch((e: Error) => notify('error', e.message))
      .finally(() => setUpdatingLists(false));
  };

  return (
    <>
      <h1>General</h1>
      <Group title="Start-up">
        <Row
          label="Open at login"
          hint={snap.openAtLogin === null ? 'Available in the installed app.' : 'Start the app when you sign in to this computer. Useful on a dedicated broadcast PC.'}
        >
          <Toggle label="Open at login" disabled={snap.openAtLogin === null} checked={!!snap.openAtLogin} onChange={(v) => run('settings:update', { openAtLogin: v })} />
        </Row>
      </Group>

      <Group
        title="Ad blocking"
        note="Google Search and Images are never filtered, because blocking Google's own requests makes its “confirm you're human” check more likely."
      >
        <Row label="Block ads and trackers" hint={snap.adblock.enabled ? `${snap.adblock.blockedCount} blocked this session` : 'Off. Pages load with their ads.'}>
          <Toggle label="Block ads and trackers" checked={snap.adblock.enabled} onChange={(v) => run('settings:update', { adblockEnabled: v })} />
        </Row>
        <Row label="Filter lists" hint={`Last updated: ${formatDate(snap.adblock.lastUpdated)}`}>
          <button className="btn sm" disabled={updatingLists || snap.adblock.updating} onClick={updateLists}>
            <RefreshCw size={13} className={updatingLists || snap.adblock.updating ? 'spin' : ''} /> Update now
          </button>
        </Row>
      </Group>

      <Group title="vMix output (NDI)">
        <NdiNameRow snap={snap} />
        <Row label="Status" hint={snap.ndi.message ?? undefined}>
          <span className={`chip ${snap.ndi.state === 'running' ? 'ok' : snap.ndi.state === 'starting' ? '' : 'err'}`}>
            {snap.ndi.state === 'running'
              ? snap.ndi.connections > 0
                ? `${snap.ndi.connections} receiving`
                : 'Ready · waiting for vMix'
              : snap.ndi.state === 'starting'
                ? 'Starting…'
                : snap.ndi.state === 'unavailable'
                  ? 'NDI not installed'
                  : 'Error'}
          </span>
        </Row>
      </Group>

      <Group title="Keyboard shortcuts">
        <dl className="shortcuts">
          <dt>Images / YouTube / Lyrics / Research</dt>
          <dd>
            {[1, 2, 3, 4].map((n) => (
              <kbd key={n}>{keys.tab(n)}</kbd>
            ))}
          </dd>
          <dt>Go to the search box</dt>
          <dd>
            <kbd>{keys.focusSearch}</kbd>
          </dd>
          <dt>Back / forward in the current tab</dt>
          <dd>
            <kbd>{keys.back}</kbd>
            <kbd>{keys.forward}</kbd>
          </dd>
          <dt>Previous / next slide</dt>
          <dd>
            <kbd>←</kbd>
            <kbd>→</kbd>
          </dd>
          <dt>Clear panels 2 and 3 to black</dt>
          <dd>
            <kbd>{keys.clear}</kbd>
          </dd>
          <dt>Settings</dt>
          <dd>
            <kbd>{keys.settings}</kbd>
          </dd>
        </dl>
      </Group>
    </>
  );
}

const NDI_NAME_HELP = "Use letters, numbers, spaces and . _ - ' & + (up to 48 characters).";

/** Renames the NDI source. Saved on Enter or when the field loses focus. */
function NdiNameRow({ snap }: { snap: AppSnapshot }) {
  const saved = snap.settings.ndiName;
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const value = draft.trim();
  const valid = NDI_NAME_PATTERN.test(value);
  const save = () => {
    if (!valid || value === saved) {
      setDraft(saved);
      return;
    }
    call('settings:update', { ndiName: value })
      .then(() => notify('success', `NDI source renamed. In vMix, choose “${value}” again.`))
      .catch((e: Error) => notify('error', e.message));
  };
  return (
    <Row label="Source name" hint={valid ? 'vMix lists it as COMPUTER-NAME (this name). Give each computer its own name.' : NDI_NAME_HELP}>
      <input
        className={`input name-input ${valid ? '' : 'invalid'}`}
        value={draft}
        maxLength={48}
        spellCheck={false}
        aria-label="NDI source name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(saved);
        }}
      />
      <button
        className="btn sm icon"
        title={`Reset to “${DEFAULT_NDI_NAME}”`}
        disabled={saved === DEFAULT_NDI_NAME}
        onClick={() => run('settings:update', { ndiName: DEFAULT_NDI_NAME })}
      >
        <RotateCcw size={13} />
      </button>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

const SAMPLE_SLIDE = 'Amazing grace, how sweet the sound\nThat saved a wretch like me';

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A colour picker that updates the output live but sends at most a few changes per second. */
function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | null>(null);
  useEffect(() => setLocal(value), [value]);
  return (
    <label className="color-input">
      <input
        type="color"
        value={local}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onChange(v), 120);
        }}
      />
      <span className="mono">{local.toUpperCase()}</span>
    </label>
  );
}

function Slides({ snap }: { snap: AppSnapshot }) {
  const s = snap.settings;
  const look = s.slides;
  const set = (patch: Partial<SlideAppearance>) => run('settings:update', { slides: patch });
  const isDefault = JSON.stringify(look) === JSON.stringify(defaultSlideAppearance()) && s.lyricsScale === 1 && !s.lyricsUppercase;
  const activePreset = SLIDE_PRESETS.find((p) => Object.entries(p.appearance).every(([k, v]) => look[k as keyof SlideAppearance] === v))?.id;

  return (
    <>
      <h1>Slides</h1>
      <p className="section-intro muted">How lyrics and research text look in panels 2 and 3 and on the NDI output. Changes show live.</p>

      <div className="slide-preview">
        <LyricsStage text={SAMPLE_SLIDE} style={lyricsStyleFor(s)} />
      </div>

      <div className="presets" role="group" aria-label="Presets">
        {SLIDE_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`preset ${activePreset === p.id ? 'on' : ''}`} title={p.hint} onClick={() => set(p.appearance)}>
            <span className={`swatch v-${p.appearance.vAlign ?? 'middle'}`} style={{ background: p.appearance.backgroundColor }}>
              <i style={{ background: p.appearance.textColor }} />
            </span>
            <span className="preset-text">
              <b>{p.label}</b>
              <small>{p.hint}</small>
            </span>
          </button>
        ))}
      </div>

      <Group title="Text">
        <Row label="Font">
          <select
            className="input select"
            value={look.fontFamily}
            aria-label="Font"
            onChange={(e) => set({ fontFamily: e.target.value as SlideAppearance['fontFamily'] })}
          >
            {SLIDE_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Size" hint="Long slides shrink automatically to fit.">
          <div className="slider">
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={s.lyricsScale}
              aria-label="Text size"
              onChange={(e) => run('settings:update', { lyricsScale: Number(e.target.value) })}
            />
            <span className="slider-value">{Math.round(s.lyricsScale * 100)}%</span>
          </div>
        </Row>
        <Row label="Text colour">
          <ColorInput label="Text colour" value={look.textColor} onChange={(v) => set({ textColor: v })} />
        </Row>
        <Row label="Uppercase">
          <Toggle label="Uppercase" checked={s.lyricsUppercase} onChange={(v) => run('settings:update', { lyricsUppercase: v })} />
        </Row>
        <Row label="Shadow" hint="Keeps text readable over pictures. Turn off for chroma key.">
          <Toggle label="Shadow" checked={look.textShadow} onChange={(v) => set({ textShadow: v })} />
        </Row>
      </Group>

      <Group title="Layout">
        <Row label="Position" hint="Bottom works as a lower third.">
          <Segmented
            label="Position"
            value={look.vAlign}
            onChange={(v) => set({ vAlign: v })}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'middle', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' }
            ]}
          />
        </Row>
        <Row label="Alignment">
          <Segmented
            label="Alignment"
            value={look.hAlign}
            onChange={(v) => set({ hAlign: v })}
            options={[
              { value: 'left', label: <AlignLeft size={14} />, title: 'Left' },
              { value: 'center', label: <AlignCenter size={14} />, title: 'Centre' },
              { value: 'right', label: <AlignRight size={14} />, title: 'Right' }
            ]}
          />
        </Row>
        <Row label="Background" hint="Green or blue lets vMix key the background out.">
          <ColorInput label="Background colour" value={look.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
        </Row>
        <Row label="Lines per slide" hint="Longest slide made from a verse. Applies to the next lyrics you highlight.">
          <Segmented
            label="Lines per slide"
            value={look.linesPerSlide}
            onChange={(v) => set({ linesPerSlide: v })}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
          />
        </Row>
      </Group>

      <button className="btn" disabled={isDefault} onClick={() => run('settings:update', { slides: defaultSlideAppearance(), lyricsScale: 1, lyricsUppercase: false })}>
        <RotateCcw size={14} /> Reset slides to default
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Updates                                                             */
/* ------------------------------------------------------------------ */

function updateHeadline(u: UpdateStatus): { title: string; detail: string; tone: 'ok' | 'info' | 'warn' | 'err' } {
  if (u.mode === 'disabled') return { title: 'Updates are off in development builds', detail: 'Install the app from the website to receive updates.', tone: 'info' };
  switch (u.state) {
    case 'checking':
      return { title: 'Checking for updates…', detail: 'Contacting the release server.', tone: 'info' };
    case 'available':
      return u.mode === 'manual'
        ? { title: `Version ${u.latestVersion} is available`, detail: 'This copy of the app cannot install updates by itself. Download the new version from the website.', tone: 'warn' }
        : { title: `Version ${u.latestVersion} is available`, detail: 'Download it now; it installs when you choose.', tone: 'warn' };
    case 'downloading':
      return { title: `Downloading version ${u.latestVersion ?? ''}…`, detail: `${u.progress ?? 0}% · you can keep working.`, tone: 'info' };
    case 'downloaded':
      return { title: `Version ${u.latestVersion} is ready to install`, detail: 'Restart now, or it installs automatically the next time you quit the app.', tone: 'ok' };
    case 'not-available':
      return { title: 'You have the latest version', detail: `Last checked ${formatDate(u.lastChecked)}.`, tone: 'ok' };
    case 'error':
      return { title: 'Could not check for updates', detail: u.error ?? 'Unknown error.', tone: 'err' };
    default:
      return { title: `Version ${u.currentVersion}`, detail: 'Check now to see if a newer version is available.', tone: 'info' };
  }
}

function Updates({ snap }: { snap: AppSnapshot }) {
  const u = snap.update;
  const s = snap.settings.updates;
  const head = updateHeadline(u);
  const disabled = u.mode === 'disabled';
  const busy = u.state === 'checking' || u.state === 'downloading';

  let action: ReactNode = (
    <button className="btn" disabled={disabled || busy} onClick={() => run('update:check')}>
      <RefreshCw size={14} className={u.state === 'checking' ? 'spin' : ''} /> Check for updates
    </button>
  );
  if (u.state === 'available') {
    action = (
      <button className="btn primary" onClick={() => run('update:download')}>
        {u.mode === 'manual' ? <ExternalLink size={14} /> : <Download size={14} />} {u.mode === 'manual' ? 'Download from website' : 'Download update'}
      </button>
    );
  } else if (u.state === 'downloaded') {
    action = (
      <button className="btn primary" onClick={() => run('update:install')}>
        <RotateCcw size={14} /> Restart and install
      </button>
    );
  }

  return (
    <>
      <h1>Updates</h1>
      <div className={`update-card ${head.tone}`}>
        <div className="update-icon">{u.state === 'not-available' || u.state === 'downloaded' ? <CircleCheck size={26} /> : <Sparkles size={26} />}</div>
        <div className="update-text">
          <div className="update-title">{head.title}</div>
          <div className="update-detail">{head.detail}</div>
          {u.state === 'downloading' ? (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.progress ?? 0}>
              <span style={{ width: `${u.progress ?? 0}%` }} />
            </div>
          ) : null}
        </div>
        <div className="update-action">{action}</div>
      </div>
      {u.latestVersion ? (
        <p className="small">
          <a href="#" onClick={(e) => (e.preventDefault(), run('app:openExternal', { url: releaseNotesUrl(u.latestVersion!) }))}>
            What's new in {u.latestVersion}
          </a>
        </p>
      ) : null}

      <Group
        title="Preferences"
        note="Updates never restart the app on their own, so a live show is never interrupted. A downloaded update installs when you click “Restart and install” or the next time you quit."
      >
        <Row label="Check for updates automatically" hint="Shortly after start-up, then every few hours.">
          <Toggle label="Check for updates automatically" disabled={disabled} checked={s.autoCheck} onChange={(v) => run('settings:update', { updatesAutoCheck: v })} />
        </Row>
        <Row
          label="Download updates automatically"
          hint={u.mode === 'manual' ? 'Not available in this copy of the app. Use the website to update.' : 'Downloads in the background; nothing installs until you restart.'}
        >
          <Toggle
            label="Download updates automatically"
            disabled={disabled || u.mode === 'manual' || !s.autoCheck}
            checked={s.autoDownload && u.mode === 'auto'}
            onChange={(v) => run('settings:update', { updatesAutoDownload: v })}
          />
        </Row>
        <Row label="Current version" hint={`Installed: ${u.currentVersion}`}>
          <button className="btn sm" onClick={() => run('app:openExternal', { url: RELEASES_URL })}>
            <FileText size={13} /> All release notes
          </button>
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

function About({ snap }: { snap: AppSnapshot }) {
  return (
    <>
      <div className="about-hero">
        <img src={logoUrl} alt="" width={88} height={88} />
        <div>
          <h1>Vmix Reference Studio</h1>
          <div className="muted">
            Version {snap.version} · {snap.platform === 'darwin' ? 'macOS' : snap.platform === 'win32' ? 'Windows' : 'Linux'}
          </div>
        </div>
      </div>
      <p className="muted">Search images, videos, lyrics and trusted sources, and send them live to vMix over NDI.</p>
      <div className="about-links">
        <button className="btn" onClick={() => run('app:openExternal', { url: WEBSITE_URL })}>
          <ExternalLink size={14} /> Website
        </button>
        <button className="btn" onClick={() => run('app:openExternal', { url: RELEASES_URL })}>
          <FileText size={14} /> Release notes
        </button>
        <button className="btn" title="Open the folder with the app's log files, to send with a problem report" onClick={() => run('app:openLogs')}>
          <FileText size={14} /> Open logs folder
        </button>
      </div>
      <p className="faint small legal">
        NDI® is a registered trademark of Vizrt NDI AB. vMix is a trademark of StudioCoast Pty Ltd. This app is not affiliated with or endorsed by either company. The app uses the NDI library
        installed on the computer and does not include it.
      </p>
    </>
  );
}
