import { NextRequest, NextResponse } from 'next/server';
import { isValidFaultId, type FaultId } from '@funnel-guardian/triage-gate';
import {
  FAULT_COOKIE_NAME,
  parseFaultList,
  serializeFaultList,
} from '@/faults/state';

export async function GET(request: NextRequest) {
  const activeFaults = parseFaultList(request.cookies.get(FAULT_COOKIE_NAME)?.value);
  return NextResponse.json({ activeFaults });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    faultId?: string;
    enabled?: boolean;
    activeFaults?: string[];
  };

  let next: FaultId[];
  if (Array.isArray(body.activeFaults)) {
    next = Array.from(new Set(body.activeFaults.filter(isValidFaultId)));
  } else if (body.faultId && isValidFaultId(body.faultId)) {
    const current = new Set(parseFaultList(request.cookies.get(FAULT_COOKIE_NAME)?.value));
    const shouldEnable = body.enabled ?? !current.has(body.faultId);
    if (shouldEnable) current.add(body.faultId);
    else current.delete(body.faultId);
    next = Array.from(current);
  } else {
    return NextResponse.json({ error: 'Provide faultId or activeFaults array' }, { status: 400 });
  }

  const res = NextResponse.json({ activeFaults: next });
  res.cookies.set(FAULT_COOKIE_NAME, serializeFaultList(next), {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ activeFaults: [] });
  res.cookies.set(FAULT_COOKIE_NAME, '', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 0,
  });
  return res;
}
