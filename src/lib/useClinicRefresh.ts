import { useEffect, useRef } from 'react';

export function useLiveRefresh(refresh: () => Promise<void>, intervalMs = 15_000) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let stopped = false;
    let pending = false;
    let again = false;
    const run = async () => {
      if (stopped) return;
      if (pending) { again = true; return; }
      pending = true;
      try { await latest.current(); } catch { /* Each view displays its own request error. */ } finally {
        pending = false;
        if (again && !stopped) { again = false; void run(); }
      }
    };
    void run();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void run(); }, intervalMs);
    const resume = () => { if (document.visibilityState === 'visible') void run(); };
    window.addEventListener('focus', resume);
    window.addEventListener('clinic:data-changed', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener('focus', resume); window.removeEventListener('clinic:data-changed', resume); document.removeEventListener('visibilitychange', resume); };
  }, [intervalMs]);
}
