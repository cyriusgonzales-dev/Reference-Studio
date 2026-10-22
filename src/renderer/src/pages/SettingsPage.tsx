import { useEffect, useState } from 'react';
import { FolderOpen, Image as ImageIcon, MonitorCheck, RefreshCw, RotateCcw } from 'lucide-react';
import { describeDisplay } from '../../../shared/displays';
import { DEFAULT_LYRICS_STYLE, type Settings } from '../../../shared/settings';
import {
  acceleratorFromKey,
  findConflicts,
  prettyAccelerator,
  SHORTCUT_DEFINITIONS,
  validateShortcut,
  type ShortcutAction
} from '../../../shared/shortcuts';
import type { AppSnapshot } from '../../../shared/types';
import { ConfirmButton, Field } from '../components/common';
import { LyricsStage } from '../components/LyricsStage';
import { call, run } from '../lib/api';
import { notify } from '../lib/stores';

type SectionPatch<K extends keyof Settings> = Partial<Settings[K]>;

function update<K extends keyof Settings>(section: K, values: SectionPatch<K>): void {
  run('settings:update', { patch: { [section]: values } as Record<string, Record<string, unknown>> });
}

/** Number input that commits on blur/Enter so typing does not spam updates. */
function NumberInput({ value, min, max, step = 1, onCommit, width = 90 }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; width?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n < min || n > max) {
      notify('error', `Enter a number between ${min} and ${max}.`);
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="input"
      type="number"
      style={{ width }}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function TextInput({ value, onCommit, width = 320, placeholder }: { value: string; onCommit: (v: string) => void; width?: number; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value) onCommit(text.trim());
  };
  return (
    <input
      className="input"
      style={{ width }}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function ShortcutRecorder({ action, value }: { action: ShortcutAction; value: string | null }) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const accel = acceleratorFromKey({ key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
      if (!accel) return; // modifiers only so far
      const problem = validateShortcut(action, accel);
      if (problem) {
        notify('error', `${accel}: ${problem}`);
        return;
      }
      setRecording(false);
      update('shortcuts', { [action]: accel } as SectionPatch<'shortcuts'>);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, action]);

  return (
    <div className="btn-row">
      <span className="kbd" style={{ minWidth: 120, textAlign: 'center' }}>
        {recording ? 'Press keys…' : prettyAccelerator(value)}
      </span>
      {recording ? (
        <button className="btn sm" onClick={() => setRecording(false)}>
          Cancel
        </button>
      ) : (
        <button className="btn sm" onClick={() => setRecording(true)}>
          Change
        </button>
      )}
      <button className="btn sm" disabled={value === null} onClick={() => update('shortcuts', { [action]: null } as SectionPatch<'shortcuts'>)}>
        Disable
      </button>
      <button className="btn sm icon" title="Reset to default" onClick={() => run('settings:resetShortcuts', { action })}>
        <RotateCcw size={13} />
      </button>
    </div>
  );
}

const FONT_PRESETS = ['Segoe UI', 'Arial', 'Calibri', 'Verdana', 'Tahoma', 'Georgia', 'Cambria', 'Times New Roman', 'Trebuchet MS', 'Bahnschrift', 'Impact'];

export function SettingsPage({ snap }: { snap: AppSnapshot }) {
  const s = snap.settings;
  const conflicts = findConflicts(s.shortcuts);
  const virtualDisplays = snap.displays.filter((d) => d.likelyVirtual);

  return (
    <div className="page">
      <div className="page-scroll">
        <div className="page-header">
          <h1>Settings</h1>
        </div>
        <div className="settings-grid">
          {/* ------------------------------------------------ output */}
          <div className="card card-pad">
            <div className="section-title">Presentation Output &amp; displays</div>
            <Field
              label="Output display"
              hint="The Presentation Output opens here. Pick the monitor (or virtual display) that vMix captures."
            >
              <div className="display-list">
                {snap.displays.map((d, i) => {
                  const selected = snap.outputWindow.displayId === d.id || (!snap.outputWindow.exists && s.output.displayId === d.id);
                  return (
                    <button key={d.id} type="button" className={`display-option ${selected ? 'selected' : ''}`} onClick={() => run('display:select', { displayId: d.id })}>
                      <MonitorCheck size={16} />
                      <span style={{ flex: 1 }}>{describeDisplay(d, i)}</span>
                      {s.output.displayId === d.id ? <span className="badge dim">Saved choice</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={() => run('display:identify')}>
                  Identify displays
                </button>
                <button className="btn sm" onClick={() => run('output:window', { command: 'open' })}>
                  Open output on chosen display
                </button>
                {s.output.displayId !== null ? (
                  <button className="btn sm" onClick={() => update('output', { displayId: null, displayLabel: null })}>
                    Use automatic choice
                  </button>
                ) : null}
              </div>
              {snap.displays.length === 1 ? (
                <div className="small warn-text" style={{ marginTop: 6 }}>
                  Only one display is connected. The output opens as a window so the operator UI stays usable; you can still capture that window in vMix.
                </div>
              ) : null}
              <div className="small faint" style={{ marginTop: 6 }}>
                {virtualDisplays.length > 0
                  ? `Virtual display detected: ${virtualDisplays.map((d) => d.label).join(', ')}.`
                  : 'No virtual display detected (optional). See docs/monitor-setup.md to configure one with a third-party driver.'}
              </div>
            </Field>
            <Field label="Open full screen" hint="Borderless full screen on the output display. On a shared single display, the output opens windowed.">
              <label className="check">
                <input type="checkbox" checked={s.output.fullscreen} onChange={(e) => update('output', { fullscreen: e.target.checked })} />
                Full screen by default
              </label>
            </Field>
            <Field label="Open output at launch">
              <label className="check">
                <input type="checkbox" checked={s.output.openOnLaunch} onChange={(e) => update('output', { openOnLaunch: e.target.checked })} />
                Open the Presentation Output when the app starts
              </label>
            </Field>
            <Field label="Transition" hint="Crossfade between images and lyrics slides. 0 disables transitions (lowest latency).">
              <div className="btn-row">
                <NumberInput value={s.output.transitionMs} min={0} max={2000} step={50} onCommit={(v) => update('output', { transitionMs: v })} />
                <span className="muted">ms</span>
                <button className="btn sm" onClick={() => update('output', { transitionMs: 0 })}>
                  Off
                </button>
              </div>
            </Field>
            <Field label="Image background">
              <input type="color" className="input" value={s.output.imageBackground} onChange={(e) => update('output', { imageBackground: e.target.value })} />
            </Field>
            <Field label="YouTube player controls" hint="Off keeps the audience view clean; playback is controlled from the live panel.">
              <label className="check">
                <input type="checkbox" checked={s.output.showYouTubeControls} onChange={(e) => update('output', { showYouTubeControls: e.target.checked })} />
                Show YouTube’s on-screen controls and cursor (applies to the next video)
              </label>
            </Field>
          </div>

          {/* ------------------------------------------------ research */}
          <div className="card card-pad">
            <div className="section-title">Research browser</div>
            <Field label="Home page">
              <TextInput value={s.research.homeUrl} onCommit={(v) => update('research', { homeUrl: v })} placeholder="https://www.google.com/imghp" />
            </Field>
            <Field label="Default search mode">
              <select className="select" value={s.research.defaultMode} onChange={(e) => update('research', { defaultMode: e.target.value as Settings['research']['defaultMode'] })}>
                <option value="images">Google Images</option>
                <option value="youtube">YouTube</option>
                <option value="web">General Web</option>
              </select>
            </Field>
            <Field label="General Web search engine">
              <select className="select" value={s.research.searchEngine} onChange={(e) => update('research', { searchEngine: e.target.value as Settings['research']['searchEngine'] })}>
                <option value="google">Google</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="bing">Bing</option>
              </select>
            </Field>
            <Field label="Avoid double audio">
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.research.pauseResearchMediaOnPresent}
                  onChange={(e) => update('research', { pauseResearchMediaOnPresent: e.target.checked })}
                />
                Pause videos in the research browser when a video goes live
              </label>
            </Field>
          </div>

          {/* ------------------------------------------------ lyrics */}
          <div className="card card-pad">
            <div className="section-title">Lyrics appearance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
              <div>
                <Field label="Font family">
                  <div className="btn-row">
                    <select className="select" value={FONT_PRESETS.includes(s.lyrics.fontFamily) ? s.lyrics.fontFamily : ''} onChange={(e) => e.target.value && update('lyrics', { fontFamily: e.target.value })}>
                      <option value="">Custom…</option>
                      {FONT_PRESETS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <TextInput value={s.lyrics.fontFamily} width={170} onCommit={(v) => update('lyrics', { fontFamily: v })} />
                  </div>
                </Field>
                <Field label="Font size" hint="Pixels on a 1080p output; scaled to the real resolution.">
                  <NumberInput value={s.lyrics.fontSize} min={16} max={240} onCommit={(v) => update('lyrics', { fontSize: v })} />
                </Field>
                <Field label="Font weight">
                  <select className="select" value={s.lyrics.fontWeight} onChange={(e) => update('lyrics', { fontWeight: Number(e.target.value) })}>
                    {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Colours">
                  <div className="btn-row">
                    <span className="muted small">Text</span>
                    <input type="color" className="input" value={s.lyrics.textColor} onChange={(e) => update('lyrics', { textColor: e.target.value })} />
                    <span className="muted small">Background</span>
                    <input type="color" className="input" value={s.lyrics.backgroundColor} onChange={(e) => update('lyrics', { backgroundColor: e.target.value })} />
                  </div>
                </Field>
                <Field label="Alignment">
                  <div className="btn-row">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} className={`btn sm ${s.lyrics.hAlign === a ? 'on' : ''}`} onClick={() => update('lyrics', { hAlign: a })}>
                        {a}
                      </button>
                    ))}
                    <span style={{ width: 10 }} />
                    {(['top', 'middle', 'bottom'] as const).map((a) => (
                      <button key={a} className={`btn sm ${s.lyrics.vAlign === a ? 'on' : ''}`} onClick={() => update('lyrics', { vAlign: a })}>
                        {a}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Line spacing">
                  <NumberInput value={s.lyrics.lineHeight} min={0.9} max={3} step={0.05} onCommit={(v) => update('lyrics', { lineHeight: v })} />
                </Field>
                <Field label="Safe margin" hint="Percent of the output width kept clear on every side.">
                  <NumberInput value={s.lyrics.marginPercent} min={0} max={25} step={0.5} onCommit={(v) => update('lyrics', { marginPercent: v })} />
                </Field>
                <Field label="Text options">
                  <div className="btn-row">
                    <label className="check">
                      <input type="checkbox" checked={s.lyrics.textShadow} onChange={(e) => update('lyrics', { textShadow: e.target.checked })} />
                      Shadow
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={s.lyrics.uppercase} onChange={(e) => update('lyrics', { uppercase: e.target.checked })} />
                      Uppercase
                    </label>
                  </div>
                </Field>
                <Field label="Background image" hint="Optional. Local files are copied into the app’s data folder.">
                  <div className="btn-row">
                    <button
                      className="btn sm"
                      onClick={() => call('lyrics:chooseBackground').catch((e: Error) => notify('error', e.message))}
                    >
                      <ImageIcon size={13} /> Choose file…
                    </button>
                    {s.lyrics.backgroundImage ? (
                      <button className="btn sm" onClick={() => update('lyrics', { backgroundImage: null })}>
                        Remove
                      </button>
                    ) : null}
                    {s.lyrics.backgroundImage ? (
                      <>
                        <span className="muted small">Dim</span>
                        <input
                          type="range"
                          min={0}
                          max={0.9}
                          step={0.05}
                          value={s.lyrics.backgroundDim}
                          onChange={(e) => update('lyrics', { backgroundDim: Number(e.target.value) })}
                        />
                      </>
                    ) : null}
                  </div>
                </Field>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <ConfirmButton
                    className="btn sm"
                    confirmLabel="Reset appearance?"
                    onConfirm={() => update('lyrics', { ...DEFAULT_LYRICS_STYLE })}
                  >
                    Reset lyrics appearance
                  </ConfirmButton>
                </div>
              </div>
              <div style={{ position: 'sticky', top: 0 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>
                  Preview
                </div>
                <div className="monitor">
                  <LyricsStage text={'Amazing grace, how sweet the sound\nThat saved a wretch like me'} style={s.lyrics} />
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ adblock */}
          <div className="card card-pad">
            <div className="section-title">Ad &amp; tracker blocking</div>
            <Field label="Status">
              <div className="small">
                {!snap.adblock.enabled
                  ? 'Off'
                  : snap.adblock.engine === 'ready'
                    ? `On — ${snap.adblock.blockedCount.toLocaleString()} requests blocked this session`
                    : snap.adblock.engine === 'loading'
                      ? 'Loading filter lists…'
                      : 'Unavailable'}
                {snap.adblock.lastUpdated ? <span className="faint"> · lists updated {new Date(snap.adblock.lastUpdated).toLocaleString()}</span> : null}
              </div>
              {snap.adblock.error ? <div className="small error-text">{snap.adblock.error}</div> : null}
            </Field>
            <Field label="Research browser">
              <label className="check">
                <input type="checkbox" checked={s.adblock.enabled} onChange={(e) => update('adblock', { enabled: e.target.checked })} />
                Block ads and trackers
              </label>
            </Field>
            <Field label="Output video" hint="If a video will not play, turn this off and present it again to test.">
              <label className="check">
                <input type="checkbox" checked={s.adblock.applyToOutput} disabled={!s.adblock.enabled} onChange={(e) => update('adblock', { applyToOutput: e.target.checked })} />
                Also filter the Presentation Output’s video player
              </label>
            </Field>
            <Field label="Filter level">
              <select className="select" value={s.adblock.level} onChange={(e) => update('adblock', { level: e.target.value as Settings['adblock']['level'] })}>
                <option value="adsAndTracking">Ads and trackers (recommended)</option>
                <option value="full">Ads, trackers and annoyances (cookie banners etc.)</option>
              </select>
            </Field>
            <Field label="Filter lists" hint="Lists are cached; a failed update keeps the previous lists.">
              <button className="btn sm" disabled={snap.adblock.updating} onClick={() => run('adblock:update')}>
                <RefreshCw size={13} /> {snap.adblock.updating ? 'Updating…' : 'Update filter lists now'}
              </button>
            </Field>
          </div>

          {/* ------------------------------------------------ shortcuts */}
          <div className="card card-pad">
            <div className="section-title">Keyboard shortcuts</div>
            {conflicts.length > 0 ? (
              <div className="small warn-text" style={{ margin: '6px 0' }}>
                Conflicting shortcuts: {conflicts.map(([a, b]) => `${a} / ${b}`).join(', ')}
              </div>
            ) : null}
            {SHORTCUT_DEFINITIONS.map((d) => (
              <Field key={d.action} label={d.label}>
                <ShortcutRecorder action={d.action} value={s.shortcuts[d.action]} />
              </Field>
            ))}
            <div className="btn-row" style={{ marginTop: 8 }}>
              <ConfirmButton className="btn sm" confirmLabel="Reset all shortcuts?" onConfirm={() => run('settings:resetShortcuts', {})}>
                Reset all shortcuts
              </ConfirmButton>
            </div>
          </div>

          {/* ------------------------------------------------ data */}
          <div className="card card-pad">
            <div className="section-title">Data &amp; troubleshooting</div>
            <Field label="Data folder" hint="Settings, queue, lyrics and bookmarks (JSON with automatic backups).">
              <div className="btn-row">
                <span className="mono ellipsis" style={{ maxWidth: 420 }} title={snap.app.dataPath}>
                  {snap.app.dataPath}
                </span>
                <button className="btn sm" onClick={() => run('app:openDataFolder')}>
                  <FolderOpen size={13} /> Open
                </button>
              </div>
            </Field>
            <Field label="Storage status">
              {snap.storageIssues.length === 0 ? (
                <span className="small" style={{ color: 'var(--ok)' }}>
                  All data loaded normally.
                </span>
              ) : (
                <ul className="small warn-text" style={{ margin: 0, paddingLeft: 18 }}>
                  {snap.storageIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="Browsing data" hint="Cookies, cache and site storage of the research browser (you will be signed out of sites).">
              <ConfirmButton className="btn sm danger" confirmLabel="Clear browsing data?" onConfirm={() => run('app:clearBrowsingData')}>
                Clear browsing data
              </ConfirmButton>
            </Field>
            <Field label="Output window">
              <button className="btn sm" onClick={() => run('output:window', { command: 'reload' })}>
                Reload output page
              </button>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
