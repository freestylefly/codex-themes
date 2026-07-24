/**
 * Pure home-surface classifier shared with the injected renderer payload.
 *
 * Codex keeps some route DOM mounted while navigating. A hidden home icon is
 * therefore not enough to prove that the active surface is the home screen.
 */
export interface HomeSurfaceSignals {
  withinShell: boolean;
  connected: boolean;
  rendered: boolean;
  visibleGameSource: boolean;
  visibleSuggestions: boolean;
  visibleTaskContent: boolean;
}

export function isActiveHomeSurface(signals: HomeSurfaceSignals): boolean {
  return signals.withinShell &&
    signals.connected &&
    signals.rendered &&
    !signals.visibleTaskContent &&
    (signals.visibleGameSource || signals.visibleSuggestions);
}
