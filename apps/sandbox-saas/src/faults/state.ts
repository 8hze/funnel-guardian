import { isValidFaultId, type FaultId } from '@funnel-guardian/triage-gate';

export const FAULT_COOKIE_NAME = 'fg_active_faults';

export function parseFaultList(raw: string | null | undefined): FaultId[] {
  if (!raw) return [];
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isValidFaultId);
  return Array.from(new Set(items));
}

export function serializeFaultList(faults: FaultId[]): string {
  return Array.from(new Set(faults)).join(',');
}

export function mergeFaultSources(
  queryFault: string | string[] | null | undefined,
  cookieValue: string | null | undefined,
  healedFault?: string | string[] | null | undefined
): FaultId[] {
  const fromQuery = parseFaultList(Array.isArray(queryFault) ? queryFault.join(',') : queryFault);
  const fromCookie = parseFaultList(cookieValue);
  const healed = new Set(
    parseFaultList(Array.isArray(healedFault) ? healedFault.join(',') : healedFault)
  );
  const merged = new Set<FaultId>([...fromCookie, ...fromQuery]);
  for (const h of healed) {
    merged.delete(h);
  }
  return Array.from(merged);
}
