import { NextRequest, NextResponse } from 'next/server';
import { isValidFaultId } from '@funnel-guardian/triage-gate';
import {
  FAULT_COOKIE_NAME,
  parseFaultList,
  serializeFaultList,
} from '@/faults/state';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    prNumber?: number;
    faultId?: string;
    decision?: 'approve' | 'reject';
  };

  if (!body.prNumber || (body.decision !== 'approve' && body.decision !== 'reject')) {
    return NextResponse.json({ error: 'Invalid approval payload' }, { status: 400 });
  }

  const currentFaults = new Set(parseFaultList(request.cookies.get(FAULT_COOKIE_NAME)?.value));
  if (body.decision === 'approve' && body.faultId && isValidFaultId(body.faultId)) {
    currentFaults.delete(body.faultId);
  }

  const nextFaults = Array.from(currentFaults);
  const res = NextResponse.json({
    ok: true,
    prNumber: body.prNumber,
    status: body.decision === 'approve' ? 'merged' : 'rejected',
    linearState: body.decision === 'approve' ? 'Done' : 'Canceled',
    healedFaultId: body.decision === 'approve' ? body.faultId : null,
    activeFaults: nextFaults,
    approvedAt: new Date().toISOString(),
  });

  if (body.decision === 'approve') {
    res.cookies.set(FAULT_COOKIE_NAME, serializeFaultList(nextFaults), {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
    });
  }

  return res;
}
