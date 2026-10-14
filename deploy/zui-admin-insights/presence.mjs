// A fresh authenticated playback lease is also evidence of current presence.
export const PRESENCE_TTL_MS = 90000;
export function devicePresence(device, playing = false, now = Date.now()) {
  const seen = Number(device.lastSeenAt || 0);
  return { online: playing || (seen > 0 && now - seen < PRESENCE_TTL_MS), playing };
}