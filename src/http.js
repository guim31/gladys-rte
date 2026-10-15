// -----------------------------------------------------------------------------
// The one HTTP helper of the two RTE clients: a timeout on every request, and
// errors that carry the HTTP status and never the request itself (the EcoWatt
// requests carry the user's credentials in their headers).
// -----------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 20_000;

/** A non-2xx answer, or a body that is not what the API documents. */
export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {number} [details.status] HTTP status
   * @param {number} [details.retryAfterMs] from a `Retry-After` header
   */
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Run one request and parse its JSON body.
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {string} [what] the API named in the error messages
 */
export async function requestJson(fetchImpl, url, init = {}, what = 'API') {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // A DNS failure, a refused connection, the timeout: the cause names it.
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'network error';
    throw new HttpError(`${what} unreachable (${cause})`);
  }
  if (!response.ok) {
    throw new HttpError(`${what} answered HTTP ${response.status}`, {
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers?.get?.('retry-after')),
    });
  }
  try {
    return await response.json();
  } catch {
    throw new HttpError(`${what} answered something that is not JSON`, {
      status: response.status,
    });
  }
}

/**
 * `Retry-After` is either a number of seconds or an HTTP date.
 * @param {string | null | undefined} value
 * @param {number} [now]
 * @returns {number | undefined} milliseconds
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
