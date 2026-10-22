import { useEffect, useRef } from 'react';
import { matchesAccelerator, normalizeKey, SHORTCUT_DEFINITIONS, type ShortcutAction } from '../../../shared/shortcuts';
import type { AppSnapshot } from '../../../shared/types';
import { run } from './api';
import { isEditableTarget, isInteractiveTarget } from './format';

/** Keys that edit text; shortcuts using them never fire while typing in a field. */
const TEXT_EDITING_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Space', 'Home', 'End', 'Backspace', 'Delete', 'PageUp', 'PageDown']);

/**
 * Operator-UI keyboard shortcuts. Web pages have their own handling in the
 * main process (only Ctrl/Alt shortcuts are taken from them). Lyrics arrow keys
 * are handled by the focused lyrics controller, not here.
 */
export function useShortcuts(snap: AppSnapshot | null, onFocusAddress: () => void): void {
  const snapRef = useRef(snap);
  const focusRef = useRef(onFocusAddress);
  useEffect(() => {
    snapRef.current = snap;
    focusRef.current = onFocusAddress;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = snapRef.current;
      if (!current || e.defaultPrevented || e.isComposing) return;
      const key = { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
      const editing = isEditableTarget(e.target);
      const normalized = normalizeKey(e.key);

      for (const def of SHORTCUT_DEFINITIONS) {
        if (def.scope !== 'anywhere' && def.scope !== 'app') continue;
        if (!matchesAccelerator(current.settings.shortcuts[def.action], key)) continue;
        if (editing && TEXT_EDITING_KEYS.has(normalized)) return;
        if (def.scope === 'app') {
          if (editing || isInteractiveTarget(e.target)) return;
          if (def.action === 'playPause' && current.output.status !== 'VIDEO') return;
        }
        if (e.repeat && def.action !== 'back' && def.action !== 'forward') {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        dispatch(def.action);
        return;
      }
    };

    const dispatch = (action: ShortcutAction) => {
      if (action === 'focusAddress') focusRef.current();
      else run('app:runShortcut', { action });
    };

    window.addEventListener('keydown', onKey);
    const off = window.vrs.on('app:shortcut', ({ action }) => {
      if (action === 'focusAddress') focusRef.current();
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);
}
