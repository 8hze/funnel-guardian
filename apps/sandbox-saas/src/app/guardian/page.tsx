import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MissionControl, type OperatorProfile } from './MissionControl';

export const dynamic = 'force-dynamic';

export default async function GuardianPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth?next=/guardian&required=1');
  }

  const operator: OperatorProfile = {
    id: user.id,
    email: user.email || 'operator@funnel-guardian.dev',
    fullName:
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Reliability Operator',
    organization: (user.user_metadata?.organization as string) || 'Funnel Guardian Ops',
    role: (user.user_metadata?.role as string) || 'SRE Lead',
  };

  return <MissionControl operator={operator} />;
}
