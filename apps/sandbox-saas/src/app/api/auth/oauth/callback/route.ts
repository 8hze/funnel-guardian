import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') || 'github';
  const state = request.nextUrl.searchParams.get('state') || '';
  const expectedState = request.cookies.get('fg_oauth_state')?.value || '';

  if (!state || !expectedState || state !== expectedState) {
    const errorUrl = new URL('/auth/error', request.url);
    errorUrl.searchParams.set('reason', 'invalid_state');
    errorUrl.searchParams.set('provider', provider);
    errorUrl.searchParams.set('received', state || 'missing');
    return NextResponse.redirect(errorUrl);
  }

  const onboardingUrl = new URL('/onboarding', request.url);
  onboardingUrl.searchParams.set('provider', provider);
  onboardingUrl.searchParams.set('verified', '1');

  const res = NextResponse.redirect(onboardingUrl);
  res.cookies.delete('fg_oauth_state');
  return res;
}
