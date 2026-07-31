/**
 * Best-effort GPS point — never throws/blocks the caller. Resolves null if
 * geolocation isn't available, permission is denied, or it just times out
 * (5s — a user tapping through an action shouldn't be stuck waiting on
 * this). Shared by "Reached Site" (ticket) and FSV "check-in" GPS capture.
 */
export function getBestEffortGpsPosition(): Promise<{ lat: number; long: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, long: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}
