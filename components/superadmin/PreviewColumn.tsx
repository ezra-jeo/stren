'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { A, Modal } from '@/lib/admin-ui';
import { OwnerDashboardPreview } from '@/components/superadmin/previews/OwnerDashboardPreview';
import { QrPosterPreview } from '@/components/superadmin/previews/QrPosterPreview';
import { MemberExperiencePreview } from '@/components/superadmin/previews/MemberExperiencePreview';
import { SetupTimeRow } from '@/components/superadmin/SetupTimeRow';
import type { PreviewData } from '@/lib/onboarding/preview';
import type { WizardStep } from '@/lib/onboarding/state';

type PreviewKind = 'owner' | 'qr' | 'member';

const PREVIEW_TITLES: Record<PreviewKind, string> = {
  owner: 'Owner dashboard preview',
  qr: 'Invite QR poster preview',
  member: 'Member experience preview',
};

function PreviewCard({ kind, data, onExpand }: { kind: PreviewKind; data: PreviewData; onExpand: (kind: PreviewKind) => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${A.border}`, backgroundColor: A.surface }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${A.border}` }}>
        <p className="text-xs font-semibold" style={{ color: A.text2 }}>{PREVIEW_TITLES[kind]}</p>
        <button
          type="button"
          onClick={() => onExpand(kind)}
          aria-label={`Expand ${PREVIEW_TITLES[kind]}`}
          className="rounded p-1 hover:bg-black/5"
          style={{ color: A.muted }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="onboarding-preview-crossfade p-3" key={JSON.stringify(data)}>
        {kind === 'owner' && <OwnerDashboardPreview data={data} />}
        {kind === 'qr' && <QrPosterPreview data={data} />}
        {kind === 'member' && <MemberExperiencePreview data={data} />}
      </div>
    </div>
  );
}

export function PreviewColumn({ data, step, stepComplete }: { data: PreviewData; step: WizardStep; stepComplete: boolean }) {
  const [expanded, setExpanded] = useState<PreviewKind | null>(null);

  return (
    <div className="hidden lg:flex lg:w-[340px] shrink-0 flex-col gap-3">
      <PreviewCard kind="owner" data={data} onExpand={setExpanded} />
      <PreviewCard kind="qr" data={data} onExpand={setExpanded} />
      <PreviewCard kind="member" data={data} onExpand={setExpanded} />
      <SetupTimeRow step={step} complete={stepComplete} />

      <Modal open={expanded !== null} onClose={() => setExpanded(null)} title={expanded ? PREVIEW_TITLES[expanded] : ''} width={420}>
        {expanded === 'owner' && <OwnerDashboardPreview data={data} />}
        {expanded === 'qr' && <QrPosterPreview data={data} />}
        {expanded === 'member' && <MemberExperiencePreview data={data} />}
      </Modal>
    </div>
  );
}
