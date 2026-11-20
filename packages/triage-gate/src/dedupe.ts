import type { DedupeRecord, ProbeObservation, TriageFilterStage } from './types.ts';

export const DEFAULT_COOLDOWN_HOURS = 6;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Runtime-agnostic FIPS 180-4 SHA-256 (works identically in Node, Edge, and Browser bundles). */
function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Deterministic SHA-256 incident fingerprint:
 * flow + errorType + route + selectorOrEndpoint
 */
export function computeIncidentHash(
  observation: Pick<ProbeObservation, 'flow' | 'errorType' | 'route' | 'selectorOrEndpoint'>
): string {
  const canonical = [
    observation.flow.trim().toLowerCase(),
    observation.errorType.trim().toLowerCase(),
    observation.route.trim().toLowerCase(),
    observation.selectorOrEndpoint.trim().toLowerCase(),
  ].join('|');

  const digest = sha256Hex(canonical).slice(0, 12);
  return `fg_${digest}`;
}

export interface DedupeEvaluation {
  isDuplicate: boolean;
  incidentHash: string;
  existingRecord?: DedupeRecord;
  stage: TriageFilterStage;
}

export class DedupeEngine {
  private records: Map<string, DedupeRecord>;
  private cooldownMs: number;

  constructor(initialRecords: DedupeRecord[] = [], cooldownHours = DEFAULT_COOLDOWN_HOURS) {
    this.records = new Map(initialRecords.map((r) => [r.hash, { ...r }]));
    this.cooldownMs = cooldownHours * 60 * 60 * 1000;
  }

  check(observation: ProbeObservation, nowMs = Date.now()): DedupeEvaluation {
    const start = Date.now();
    const incidentHash = computeIncidentHash(observation);
    const existing = this.records.get(incidentHash);

    if (existing) {
      const cooldownUntilMs = new Date(existing.cooldownUntil).getTime();
      const withinCooldown = nowMs < cooldownUntilMs;
      const isOpen = existing.status === 'open';

      if (isOpen || withinCooldown) {
        existing.occurrences += 1;
        existing.lastSeenAt = new Date(nowMs).toISOString();
        const remainingMinutes = Math.max(1, Math.round((cooldownUntilMs - nowMs) / 60000));
        return {
          isDuplicate: true,
          incidentHash,
          existingRecord: { ...existing },
          stage: {
            stage: 'deduplication',
            outcome: 'dropped',
            durationMs: Math.max(2, Date.now() - start),
            reason: `Duplicate incident (${incidentHash}) already tracked in Linear ${existing.linearTicketId} (${existing.status}, cooldown ${remainingMinutes}m left, seen ${existing.occurrences}x). Discarded without re-triggering agents.`,
            details: {
              incidentHash,
              linearTicketId: existing.linearTicketId,
              occurrences: existing.occurrences,
              withinCooldown,
            },
          },
        };
      }
    }

    return {
      isDuplicate: false,
      incidentHash,
      stage: {
        stage: 'deduplication',
        outcome: 'passed',
        durationMs: Math.max(2, Date.now() - start),
        reason: `Unique incident fingerprint ${incidentHash} (no open Linear ticket or active 6h cooldown).`,
        details: {
          incidentHash,
          unique: true,
        },
      },
    };
  }

  recordIncident(
    observation: ProbeObservation,
    linearTicketId: string,
    nowMs = Date.now()
  ): DedupeRecord {
    const hash = computeIncidentHash(observation);
    const isoNow = new Date(nowMs).toISOString();
    const record: DedupeRecord = {
      hash,
      linearTicketId,
      faultId: observation.faultHint,
      flow: observation.flow,
      route: observation.route,
      firstSeenAt: isoNow,
      lastSeenAt: isoNow,
      occurrences: 1,
      cooldownUntil: new Date(nowMs + this.cooldownMs).toISOString(),
      status: 'open',
    };
    this.records.set(hash, record);
    return { ...record };
  }

  markResolved(hash: string): void {
    const rec = this.records.get(hash);
    if (rec) {
      rec.status = 'resolved';
      rec.cooldownUntil = new Date(0).toISOString();
    }
  }

  list(): DedupeRecord[] {
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  clear(): void {
    this.records.clear();
  }
}
