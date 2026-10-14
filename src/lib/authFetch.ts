export const AUTH_REQUEST_TIMEOUT_MS = 12_000;
export const AUTH_LOGOUT_TIMEOUT_MS = 3_000;
export const AUTH_TIMEOUT_MESSAGE = 'The account service took too long to respond. Please try again.';

// Abort the network request itself, including its response body. A timed-out
// password operation must not keep running in the browser behind a retry.
export const boundedAuthFetch: typeof fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const path = new URL(url, window.location.origin).pathname;
  if (!path.startsWith('/auth/v1/')) return fetch(input, init);

  const controller = new AbortController();
  const callerSignal = init.signal ?? (input instanceof Request ? input.signal : null);
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(AUTH_TIMEOUT_MESSAGE, 'TimeoutError'));
  }, path === '/auth/v1/logout' ? AUTH_LOGOUT_TIMEOUT_MS : AUTH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (timedOut) throw new Error(AUTH_TIMEOUT_MESSAGE);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
};
