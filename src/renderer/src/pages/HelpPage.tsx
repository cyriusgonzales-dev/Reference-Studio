import { prettyAccelerator, SHORTCUT_DEFINITIONS } from '../../../shared/shortcuts';
import type { AppSnapshot } from '../../../shared/types';

const SCOPE_LABEL = {
  anywhere: 'Anywhere in the app, including web pages',
  app: 'Operator UI (not while typing)',
  lyrics: 'Lyrics live controller focused',
  output: 'Presentation Output window focused'
} as const;

export function HelpPage({ snap }: { snap: AppSnapshot }) {
  return (
    <div className="page">
      <div className="page-scroll doc" style={{ maxWidth: 980 }}>
        <div className="page-header">
          <h1>Help &amp; keyboard shortcuts</h1>
          <span className="spacer" />
          <span className="faint small">Version {snap.app.version}</span>
        </div>

        <div className="card card-pad">
          <div className="section-title">Keyboard shortcuts</div>
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Keys</th>
                <th>Works when</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUT_DEFINITIONS.map((d) => (
                <tr key={d.action}>
                  <td>{d.label}</td>
                  <td>
                    <span className="kbd">{prettyAccelerator(snap.settings.shortcuts[d.action])}</span>
                  </td>
                  <td className="muted small">{SCOPE_LABEL[d.scope]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            Shortcuts can be changed or disabled in Settings → Keyboard shortcuts. Shortcuts never fire while you type in a text field if they would
            interfere with editing (arrows, Enter, Space). Plain keys are never taken from web pages, so YouTube’s own keys keep working.
          </p>
        </div>

        <h2>The safe presentation workflow</h2>
        <ol>
          <li>
            <b>Research</b> in the browser. Nothing you browse reaches the audience.
          </li>
          <li>
            <b>Right-click</b> an image or a YouTube video link → <i>Preview</i>, <i>Add to Queue</i> or <i>Present</i>. On a YouTube watch page, use the
            blue “YouTube video on this page” bar.
          </li>
          <li>
            <b>Preview</b> shows the item in the yellow panel. It never changes the live output.
          </li>
          <li>
            <b>Present</b> (red buttons or Ctrl+Enter) is the only action that changes what the audience sees.
          </li>
          <li>
            <b>Clear to black</b> (Ctrl+Shift+B) blanks the output without deleting anything; <b>Restore</b> brings it back.
          </li>
        </ol>

        <h2>Google Images tips</h2>
        <ul>
          <li>Thumbnails in the results grid are small previews. Click a result first, then right-click the large image in the side panel.</li>
          <li>If an original image cannot be loaded (hotlink protection, removed file), the live panel offers the preview-size image or the source page.</li>
        </ul>

        <h2>vMix capture in short</h2>
        <ol>
          <li>Settings → Output display: choose the second monitor (or a virtual display), then click <i>Open Output</i>.</li>
          <li>In vMix: Add Input → Desktop Capture → choose that display, or the window “VRS Presentation Output”.</li>
          <li>Present a test image, video and lyrics slide, then Clear to black, and confirm each in the vMix preview.</li>
        </ol>
        <p>
          Full guides are in the <span className="mono">docs</span> folder: vMix setup, monitor configuration, lyrics, ad-block troubleshooting and known
          limitations.
        </p>

        <h2>Known limitations</h2>
        <ul>
          <li>Some YouTube videos cannot be embedded, need sign-in or are region-locked. Use “Try YouTube watch page” or “Open in browser”.</li>
          <li>Ad blocking reduces but cannot guarantee removal of all YouTube ads.</li>
          <li>Virtual displays require a third-party driver; this app only detects and uses them.</li>
        </ul>
      </div>
    </div>
  );
}
