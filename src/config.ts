export const DEFAULT_MAX_INACTIVITY_MS = 24 * 60 * 60 * 1000;

export function getMaxInactivityMs(env = process.env): number {
  const raw = env.SSH_CLI_MAX_INACTIVITY_MS;
  if (!raw) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  if (!/^\d+$/.test(raw)) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  return parsed;
}
