import { env } from '../config/env';

const NOTIFY_TIMEOUT_MS = 3_000;
/** Retries exist because a notification that never lands is not a slow page, it
 *  is a page that stays wrong: an unpublished product kept painting its detail
 *  document for at least 15 minutes once its cached read started failing to
 *  refresh, because a failed revalidation leaves the previous copy in place. */
const NOTIFY_DELAYS_MS = [0, 1_500, 4_500];

function warn(message: string) {
  // eslint-disable-next-line no-console
  console.warn(`[storefront-cache] ${message}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tells the storefront its cached pages are no longer fresh.
 *
 * Fire-and-forget by design: the admin's write already succeeded, and a
 * storefront that is unreachable must not fail it. Nothing here changes what the
 * API itself will serve - an inactive product is refused at cart and checkout
 * regardless of what a cached page painted.
 */
export function revalidateStorefront(productSlug: string): void {
  const secret = env.FRONTEND_REVALIDATE_SECRET;
  if (!secret) return;

  const url = `${env.APP_FRONTEND_URL.replace(/\/+$/, '')}/api/revalidate`;

  void (async () => {
    for (let attempt = 1; attempt <= NOTIFY_DELAYS_MS.length; attempt += 1) {
      await sleep(NOTIFY_DELAYS_MS[attempt - 1]);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
          body: JSON.stringify({ productSlug }),
          signal: controller.signal,
        });
        if (response.ok) return;
        warn(`attempt ${attempt} refused by the storefront with HTTP ${response.status}`);
      } catch (error) {
        const reason = (error as Error)?.name === 'AbortError' ? 'timed out' : (error as Error).message;
        warn(`attempt ${attempt} failed: ${reason}`);
      } finally {
        clearTimeout(timer);
      }
    }
    warn(`storefront ${url} stayed unreachable; cached pages will not self-heal`);
  })();
}
