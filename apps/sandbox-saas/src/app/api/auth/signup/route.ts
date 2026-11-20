import { NextRequest, NextResponse } from 'next/server';
import {
  buildRateLimitHeaders,
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_POLICIES,
} from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    organization?: string;
    role?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };

  const clientIp = extractClientIp(request);
  const rl = checkRateLimit(RATE_LIMIT_POLICIES.authSignUp, clientIp);
  const rlHeaders = buildRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Registration rate limit exceeded. Try again in ${rl.retryAfterSec}s.`,
        code: 'rate_limited',
        rateLimit: rl,
      },
      { status: 429, headers: rlHeaders }
    );
  }

  const fullName = (body.fullName || '').trim();
  const organization = (body.organization || '').trim();
  const role = (body.role || 'Engineering Lead').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const confirmPassword = body.confirmPassword || '';

  if (fullName.length < 2) {
    return NextResponse.json(
      { error: 'Full name must be at least 2 characters.', rateLimit: rl },
      { status: 400, headers: rlHeaders }
    );
  }
  if (organization.length < 2) {
    return NextResponse.json(
      { error: 'Organization name must be at least 2 characters.', rateLimit: rl },
      { status: 400, headers: rlHeaders }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Enter a valid work email address.', rateLimit: rl },
      { status: 400, headers: rlHeaders }
    );
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError, rateLimit: rl }, { status: 400, headers: rlHeaders });
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: 'Password confirmation does not match.', rateLimit: rl },
      { status: 400, headers: rlHeaders }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization,
        role,
      },
    },
  });

  if (error || !data.user) {
    const status = error?.status === 429 ? 429 : 400;
    return NextResponse.json(
      {
        error: error?.message || 'Unable to register operator account.',
        code: status === 429 ? 'rate_limited' : 'signup_failed',
        rateLimit: rl,
      },
      { status, headers: rlHeaders }
    );
  }

  // If Supabase auto-confirm is active, session is issued immediately; otherwise inform cleanly
  const hasSession = Boolean(data.session);

  return NextResponse.json(
    {
      ok: true,
      requiresEmailConfirmation: !hasSession,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName,
        organization,
        role,
      },
      rateLimit: rl,
    },
    { status: 201, headers: rlHeaders }
  );
}
