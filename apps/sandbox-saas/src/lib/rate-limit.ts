import type { NextRequest } from 'next/server';

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  id: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

export const RATE_LIMIT_POLICIES = {
  authSignIn: { id: 'auth:signin', limit: 5, windowMs: 60_000 },
  authSignUp: { id: 'auth:signup', limit: 3, windowMs: 15 * 60_000 },
  guardianApi: { id: 'guardian:api', limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

export function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Sliding-window in-memory rate limiter with deterministic standard headers.
 * Protects Supabase Auth & Guardian APIs from credential stuffing and probe floods.
 */
export function checkRateLimit(config: RateLimitConfig, subjectKey: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;
  const fullKey = `${config.id}:${subjectKey}`;

  let bucket = buckets.get(fullKey);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(fullKey, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= config.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const resetAtMs = oldest + config.windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAtMs,
      retryAfterSec,
    };
  }

  bucket.timestamps.push(now);
  const oldest = bucket.timestamps[0] ?? now;
  const resetAtMs = oldest + config.windowMs;

  // Periodic map compaction to prevent unbounded memory growth
  if (buckets.size > 2000) {
    for (const [k, b] of buckets.entries()) {
      if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] < cutoff) {
        buckets.delete(k);
      }
    }
  }

  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - bucket.timestamps.length),
    resetAtMs,
    retryAfterSec: 0,
  };
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSec);
  }
  return headers;
}
