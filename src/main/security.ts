import { app, session, type Session, type WebContents } from 'electron';
import { isHttpUrl } from '../shared/urls';

/**
 * Process-wide hardening applied to every WebContents the app creates.
 * Individual views add stricter, view-specific navigation rules on top.
 */

export const RESEARCH_PARTITION = 'persist:research';
export const MEDIA_PARTITION = 'persist:media';

/** Permissions remote pages may use. Everything else (camera, mic, geolocation, notifications, …) is denied. */
const REMOTE_ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

/** A Chrome user agent without the Electron and application tokens, so sites serve their normal layout. */
export function browserUserAgent(): string {
  const major = (process.versions.chrome ?? '120').split('.')[0];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export function hardenRemoteSession(ses: Session): void {
  ses.setUserAgent(browserUserAgent());
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(REMOTE_ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => REMOTE_ALLOWED_PERMISSIONS.has(permission));
  ses.setDevicePermissionHandler(() => false);
  // Downloads are not part of the workflow; media is never persisted by default.
  ses.on('will-download', (event) => event.preventDefault());
}

export function hardenAppSession(): void {
  const ses = session.defaultSession;
  // The operator UI and the output page need no browser permissions at all.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());
}

/**
 * Global guards: no <webview>, no unexpected windows, no navigation to
 * non-web schemes. Views refine these rules with their own handlers.
 */
export function installGlobalWebContentsGuards(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isHttpUrl(url) && !url.startsWith('file:') && !url.startsWith('http://localhost')) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isHttpUrl(url)) event.preventDefault();
    });
  });
}

/** Locks a trusted app page to its own document: any navigation away is cancelled. */
export function lockNavigation(contents: WebContents, isAllowed: (url: string) => boolean): void {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) event.preventDefault();
  });
  contents.on('will-frame-navigate', (event) => {
    if (!isAllowed(event.url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
