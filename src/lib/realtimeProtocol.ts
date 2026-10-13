export type ClinicStreamEvent =
  | { kind: 'change'; table?: string }
  | { kind: 'auth-error'; code?: string }
  | { kind: 'sync-error' };

export function parseClinicStreamEvent(block: string): ClinicStreamEvent | null {
  const lines = block.split('\n');
  const event =
    lines
      .find(line => line.startsWith('event:'))
      ?.slice(6)
      .trim() || 'message';
  const content = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .join('\n');
  if (!content) return null;
  try {
    const payload: unknown = JSON.parse(content);
    if (typeof payload !== 'object' || payload === null) return null;
    const data = payload as { changed?: unknown; table?: unknown; code?: unknown };
    if (event === 'sync-error') return { kind: 'sync-error' };
    if (event === 'auth-error')
      return { kind: 'auth-error', ...(typeof data.code === 'string' ? { code: data.code } : {}) };
    if (event !== 'message' || data.changed !== true) return null;
    return {
      kind: 'change',
      ...(typeof data.table === 'string' && /^[a-z_]{1,63}$/.test(data.table)
        ? { table: data.table }
        : {}),
    };
  } catch {
    return null;
  }
}
