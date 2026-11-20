import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Operator',
      organization: (user.user_metadata?.organization as string) || 'Funnel Guardian',
      role: (user.user_metadata?.role as string) || 'Reliability Operator',
      lastSignInAt: user.last_sign_in_at,
    },
  });
}
