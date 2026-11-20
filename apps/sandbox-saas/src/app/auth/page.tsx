import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthConsole } from './AuthConsole';

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; required?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeNext =
    sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/guardian';

  if (user) {
    redirect(safeNext);
  }

  return (
    <AuthConsole
      initialMode={sp.mode === 'signup' ? 'signup' : 'signin'}
      nextPath={safeNext}
      authRequiredNotice={sp.required === '1'}
    />
  );
}
