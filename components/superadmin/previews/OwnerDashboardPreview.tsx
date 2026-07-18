'use client';

import { LayoutDashboard, KeyRound } from 'lucide-react';
import { GymAvatar } from '@/components/gyms/gym-badges';
import type { PreviewData } from '@/lib/onboarding/preview';

export function OwnerDashboardPreview({ data }: { data: PreviewData }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'hsl(var(--charcoal))' }}>
      <div className="flex items-center gap-2 mb-3">
        <GymAvatar name={data.gymName} logoUrl={data.logoUrl} size={28} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--light-gray))' }}>{data.gymName}</p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--gray))' }}>{data.branchName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 mb-2" style={{ backgroundColor: 'hsl(var(--graphite))' }}>
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--light-gray))' }} />
        <p className="text-xs truncate" style={{ color: 'hsl(var(--light-gray))' }}>Welcome, {data.ownerName}</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'hsl(var(--graphite))' }}>
        <KeyRound className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--gray))' }} />
        <p className="text-xs truncate" style={{ color: 'hsl(var(--gray))' }}>{data.planSummary}</p>
      </div>
    </div>
  );
}
