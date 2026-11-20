import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      vendor: 'metricpulse-analytics',
      origin: 'https://cdn.metricpulse-analytics.invalid/collect',
      error: 'Internal analytics collector error (simulated 3rd-party 500)',
    },
    { status: 500 }
  );
}
