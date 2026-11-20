import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FAULT_COOKIE_NAME, mergeFaultSources } from '@/faults/state';

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') || 'github';
  const activeFaults = mergeFaultSources(
    request.nextUrl.searchParams.get('fault'),
    request.cookies.get(FAULT_COOKIE_NAME)?.value,
    request.nextUrl.searchParams.get('healed')
  );

  const faultBrokenState = activeFaults.includes('oauth-broken-state');
  const nonce = randomUUID();
  // Fault F-03: Corrupts callback state nonce so /api/auth/oauth/callback rejects the redirect
  const callbackState = faultBrokenState ? `expired_${nonce.slice(0, 8)}` : nonce;

  const callbackUrl = new URL('/api/auth/oauth/callback', request.url);
  callbackUrl.searchParams.set('provider', provider);
  callbackUrl.searchParams.set('state', callbackState);

  const res = NextResponse.redirect(callbackUrl);
  res.cookies.set('fg_oauth_state', nonce, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 300,
  });
  return res;
}
