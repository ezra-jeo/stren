import { AlertTriangle } from 'lucide-react';
import { A, ACard, PageHeader } from '@/lib/admin-ui';

export function ReportingUnavailable({ section }: { section: 'Dashboard' | 'Reports' }) {
  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title={`${section} unavailable`}
        subtitle="The latest business data could not be loaded."
      />
      <ACard className="p-6">
        <div role="alert" className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#B45309' }} />
          <div>
            <p className="font-semibold" style={{ color: A.text }}>No totals are shown</p>
            <p className="mt-1 text-sm" style={{ color: A.text2 }}>
              Refresh to try again. A real zero will appear only after Stren successfully checks the data.
            </p>
          </div>
        </div>
      </ACard>
    </div>
  );
}
