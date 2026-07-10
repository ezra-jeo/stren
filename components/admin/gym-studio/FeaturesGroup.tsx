'use client';

import { SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { RailGroup } from './RailGroup';
import { useStudio } from './GymPageStudio';
import { FEATURE_CATALOG, isFeatureEnabled, type FeatureDef } from '@/lib/features';

const GROUPS: { group: FeatureDef['group']; heading: string }[] = [
  { group: 'members', heading: 'Members' },
  { group: 'public', heading: 'Public page' },
  { group: 'operations', heading: 'Operations' },
  { group: 'coming_soon', heading: 'Coming soon' },
];

function FeatureSwitch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="relative h-6 w-11 flex-none rounded-full transition-colors"
      style={{ backgroundColor: on ? 'var(--color-success)' : 'var(--color-surface)' }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? '22px' : '2px' }}
      />
    </button>
  );
}

function FeatureRow({ def }: { def: FeatureDef }) {
  const s = useStudio();
  const teaser = def.status === 'coming_soon';
  const on = isFeatureEnabled(s.featureFlags, def.key);

  return (
    <div className="py-2" style={{ opacity: teaser ? 0.72 : 1 }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{def.label}</span>
        {teaser ? (
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
            Coming soon
          </span>
        ) : (
          <FeatureSwitch on={on} label={def.label} onClick={() => s.toggleFeature(def.key)} />
        )}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>{def.effect}</p>
      {def.key === 'kiosk_checkin' && !on && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--color-warning)' }}>
          <AlertTriangle size={12} /> Front-desk check-ins are paused.
        </p>
      )}
    </div>
  );
}

export function FeaturesGroup() {
  const s = useStudio();
  if (!s.canManageFeatures) return null;

  return (
    <RailGroup
      id="features"
      icon={<SlidersHorizontal size={16} />}
      title="Features"
      subtitle="What members and visitors can use"
      open={s.openGroups.features}
      onToggle={() => s.toggleGroup('features')}
    >
      <div className="flex flex-col gap-3 pt-1">
        {GROUPS.map(({ group, heading }) => (
          <div key={group}>
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{heading}</div>
            <div className="divide-y" style={{ borderColor: 'var(--color-surface)' }}>
              {FEATURE_CATALOG.filter((d) => d.group === group).map((def) => (
                <FeatureRow key={def.key} def={def} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </RailGroup>
  );
}
