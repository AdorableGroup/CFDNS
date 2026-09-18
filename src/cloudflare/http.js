const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 50;

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with retry/backoff. Respects Cloudflare's 429 cooldown, fails fast
 * on permanent 4xx errors (404 etc — retrying wastes ~20+ minutes for nothing),
 * and otherwise backs off exponentially up to 30s.
 *
 * @param {(msg: string) => Promise<void>} [onGiveUp] Called once, right before
 *   the final throw, so the caller can notify (e.g. webhook) without this
 *   module knowing about notification channels.
 */
export const createFetchWithRetry = (onGiveUp) =>
  async function fetchRetry(...args) {
    let attempt = 0;
    let response;

    while (attempt < MAX_ATTEMPTS) {
      try {
        response = await fetch(...args);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response;
      } catch (error) {
        attempt++;
        const isRateLimit = response?.status === RATE_LIMIT_STATUS;
        const isPermanentClientError =
          response && response.status >= 400 && response.status < 500 && !isRateLimit;

        if (isPermanentClientError) {
          console.warn(`Request failed: "${error.message}" — not retrying (permanent client error)`);
          await onGiveUp?.(`Permanent HTTP error (${response.status}). Check logs.`);
          throw error;
        }

        const backoff = isRateLimit
          ? RATE_LIMIT_COOLDOWN_MS
          : Math.min(1000 * 2 ** attempt, 30_000);

        console.warn(
          `Request failed: "${error.message}" — retry ${attempt}/${MAX_ATTEMPTS}` +
            (isRateLimit ? ` (rate limited, waiting ${backoff / 1000}s)` : "")
        );

        if (attempt >= MAX_ATTEMPTS) {
          await onGiveUp?.(`HTTP error (${response?.status ?? "unknown"}) after ${MAX_ATTEMPTS} attempts. Check logs.`);
          throw error;
        }

        await wait(backoff);
      }
    }
  };
