import { NextRequest, NextResponse } from 'next/server';
import {
  buildRateLimitHeaders,
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_POLICIES,
} from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const clientIp = extractClientIp(request);

  // Rate limit per IP + target email (sliding window: 5 attempts / 60s)
  const rl = checkRateLimit(RATE_LIMIT_POLICIES.authSignIn, `${clientIp}:${email || 'anon'}`);
  const rlHeaders = buildRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Rate limit active — retry in ${rl.retryAfterSec}s.`,
        code: 'rate_limited',
        rateLimit: rl,
      },
      { status: 429, headers: rlHeaders }
    );
  }

  if (!EMAIL_RE.test(email) || password.length < 8) {
    return NextResponse.json(
      {
        error: 'Enter a valid work email and password (minimum 8 characters).',
        rateLimit: rl,
      },
      { status: 400, headers: rlHeaders }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    const isSupabaseRateLimit = error?.status === 429;
    return NextResponse.json(
      {
        error: isSupabaseRateLimit
          ? 'Supabase Auth rate limit exceeded. Please wait before trying again.'
          : error?.message || 'Invalid email or password.',
        code: isSupabaseRateLimit ? 'rate_limited' : 'invalid_credentials',
        rateLimit: rl,
      },
      { status: isSupabaseRateLimit ? 429 : 401, headers: rlHeaders }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: (data.user.user_metadata?.full_name as string) || data.user.email?.split('@')[0],
        organization: (data.user.user_metadata?.organization as string) || 'Funnel Guardian Org',
        role: (data.user.user_metadata?.role as string) || 'Engineering Operator',
      },
      rateLimit: rl,
    },
    { status: 200, headers: rlHeaders }
  );
}
