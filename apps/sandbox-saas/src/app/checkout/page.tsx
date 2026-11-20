import { cookies } from 'next/headers';
import { SandboxShell } from '@/components/SandboxShell';
import { FAULT_COOKIE_NAME, mergeFaultSources } from '@/faults/state';
import { CheckoutClient } from './CheckoutClient';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; fault?: string; healed?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const activeFaults = mergeFaultSources(
    sp.fault,
    cookieStore.get(FAULT_COOKIE_NAME)?.value,
    sp.healed
  );
  const planId = sp.plan === 'scale' ? 'scale' : 'growth';

  return (
    <SandboxShell activeFaults={activeFaults} currentPath="/checkout">
      <CheckoutClient
        planId={planId}
        activeFaults={activeFaults}
        queryFaultString={sp.fault || ''}
      />
    </SandboxShell>
  );
}
