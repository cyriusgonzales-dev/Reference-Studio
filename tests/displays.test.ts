import { describe, expect, it } from 'vitest';
import { chooseOutputDisplay, describeDisplay, isLikelyVirtualDisplay } from '../src/shared/displays';
import type { DisplayInfo } from '../src/shared/types';

function display(id: number, overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  const x = overrides.bounds?.x ?? (id - 1) * 1920;
  return {
    id,
    label: `Monitor ${id}`,
    nameKnown: true,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    workArea: { x, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    rotation: 0,
    isPrimary: id === 1,
    internal: false,
    likelyVirtual: false,
    pixelWidth: 1920,
    pixelHeight: 1080,
    ...overrides
  };
}

const none = { displayId: null, displayLabel: null };

describe('display selection', () => {
  it('returns null with no displays', () => {
    expect(chooseOutputDisplay([], none, null)).toBeNull();
  });

  it('uses the only display and flags that it is shared', () => {
    const choice = chooseOutputDisplay([display(1)], none, 1);
    expect(choice?.reason).toBe('only-display');
    expect(choice?.sharesMainDisplay).toBe(true);
    expect(choice?.preferredMissing).toBe(false);
  });

  it('prefers a secondary display not hosting the operator window', () => {
    const choice = chooseOutputDisplay([display(1), display(2)], none, 1);
    expect(choice?.display.id).toBe(2);
    expect(choice?.reason).toBe('secondary');
    expect(choice?.sharesMainDisplay).toBe(false);
  });

  it('avoids the operator display even when it is not primary', () => {
    const choice = chooseOutputDisplay([display(1), display(2)], none, 2);
    expect(choice?.display.id).toBe(1);
  });

  it('prefers external over internal laptop panels', () => {
    const displays = [display(1), display(2, { internal: true }), display(3)];
    expect(chooseOutputDisplay(displays, none, 1)?.display.id).toBe(3);
  });

  it('honours the saved display by id, then by unique name', () => {
    const displays = [display(1), display(2), display(3, { label: 'Virtual Display' })];
    expect(chooseOutputDisplay(displays, { displayId: 3, displayLabel: null }, 1)?.reason).toBe('preferred');
    const byName = chooseOutputDisplay(displays, { displayId: 99, displayLabel: 'Virtual Display' }, 1);
    expect(byName?.display.id).toBe(3);
    expect(byName?.reason).toBe('preferred-by-name');
  });

  it('falls back and reports a missing preferred display', () => {
    const choice = chooseOutputDisplay([display(1), display(2)], { displayId: 77, displayLabel: 'Gone' }, 1);
    expect(choice?.display.id).toBe(2);
    expect(choice?.preferredMissing).toBe(true);
  });

  it('flags likely virtual displays', () => {
    expect(isLikelyVirtualDisplay('Virtual Display Driver')).toBe(true);
    expect(isLikelyVirtualDisplay('IddSampleDriver Device')).toBe(true);
    expect(isLikelyVirtualDisplay('Parsec Virtual Display Adapter')).toBe(true);
    expect(isLikelyVirtualDisplay('DELL U2419H')).toBe(false);
  });

  it('describes displays for the UI', () => {
    expect(describeDisplay(display(1, { scaleFactor: 1.25, pixelWidth: 2400, pixelHeight: 1350 }), 0)).toBe(
      '1. Monitor 1 — 2400×1350 @ 125% (primary)'
    );
  });
});
