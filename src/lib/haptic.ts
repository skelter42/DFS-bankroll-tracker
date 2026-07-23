export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}
