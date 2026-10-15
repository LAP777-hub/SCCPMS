import { authenticatedFetch } from './api';
import type { Session } from '@supabase/supabase-js';
import { currentAuthSession, sameAuthSession, sessionRequestVersion } from './session';
import { parseClinicStreamEvent } from './realtimeProtocol';

export function connectClinicUpdates() {
  const controller = new AbortController();
  const version = sessionRequestVersion();
  let expectedSession: Session | null = null;
  async function listen() {
    while (!controller.signal.aborted) {
      const attempt = new AbortController();
      // A dropped mobile connection or stalled proxy must not leave a reader
      // waiting forever. Server streams normally close within 50–60 seconds.
      const deadline = window.setTimeout(() => attempt.abort(), 75_000);
      try {
        const session = await currentAuthSession();
        if (!session || version !== sessionRequestVersion()) return;
        if (expectedSession && !sameAuthSession(expectedSession, session)) return;
        expectedSession ??= session;
        const response = await authenticatedFetch('/api/events', { signal: AbortSignal.any([controller.signal, attempt.signal]) });
        if (controller.signal.aborted || version !== sessionRequestVersion()) {
          await response.body?.cancel().catch(() => undefined);
          return;
        }
        if (response.status === 428) return;
        if (!response.ok || !response.body) throw new Error('Synchronization unavailable');
        // Reload after reconnecting to include changes committed while offline.
        window.dispatchEvent(new CustomEvent('clinic:data-changed', { detail: { remote: true } }));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!controller.signal.aborted && version === sessionRequestVersion()) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            buffer = buffer.replace(/\r\n/g, '\n');
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const event = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const data = parseClinicStreamEvent(event);
              if (
                data?.kind === 'change' &&
                !controller.signal.aborted &&
                version === sessionRequestVersion()
              ) {
                window.dispatchEvent(
                  new CustomEvent('clinic:data-changed', {
                    detail: { remote: true, table: data.table },
                  })
                );
              } else if (data?.kind === 'auth-error' || data?.kind === 'sync-error') {
                if (
                  data.kind === 'auth-error' &&
                  ['ACCOUNT_DISABLED', 'OTP_REQUIRED'].includes(data.code ?? '')
                ) {
                  const current = await currentAuthSession().catch(() => null);
                  if (
                    !controller.signal.aborted &&
                    version === sessionRequestVersion() &&
                    sameAuthSession(expectedSession, current)
                  ) {
                    if (data.code === 'ACCOUNT_DISABLED')
                      window.dispatchEvent(
                        new CustomEvent('clinic:session-expired', { detail: { code: data.code } })
                      );
                    else window.dispatchEvent(new Event('clinic:otp-required'));
                  }
                }
                // Reconnecting uses the existing rejected-token renewal path.
                // A stream's expired token must not sign out a renewed session.
                await reader.cancel().catch(() => undefined);
                buffer = '';
                break;
              }
              boundary = buffer.indexOf('\n\n');
            }
          }
        } finally {
          if (controller.signal.aborted || version !== sessionRequestVersion())
            await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } catch {
        /* Dashboard polling remains available while the stream reconnects. */
      } finally {
        window.clearTimeout(deadline);
        attempt.abort();
      }
      if (!controller.signal.aborted)
        await new Promise<void>(resolve => {
          const done = () => {
            clearTimeout(timeout);
            controller.signal.removeEventListener('abort', done);
            resolve();
          };
          const timeout = setTimeout(done, 3000);
          controller.signal.addEventListener('abort', done, { once: true });
        });
    }
  }
  void listen();
  return () => controller.abort();
}
