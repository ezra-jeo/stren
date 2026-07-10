'use client';

import { FileText, X } from 'lucide-react';
import { RailGroup } from './RailGroup';
import { useStudio } from './GymPageStudio';
import { compactFieldClass, fieldStyle } from './studio-styles';
import type { GymPreviewView } from '@/components/gym/GymLandingPreview';

function SubCardHead({ title, tag, onPreview }: { title: string; tag: string; onPreview: () => void }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {title}
        <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          {tag}
        </span>
      </span>
      <button type="button" onClick={onPreview} className="text-[11px] font-semibold" style={{ color: 'var(--color-primary)' }}>
        Preview →
      </button>
    </div>
  );
}

export function SubpagesGroup() {
  const s = useStudio();
  const jump = (tab: GymPreviewView) => s.setPreviewTab(tab);

  return (
    <RailGroup
      id="subpages"
      icon={<FileText size={16} />}
      title="Subpages"
      subtitle="Team, pricing, location"
      open={s.openGroups.subpages}
      onToggle={() => s.toggleGroup('subpages')}
    >
      <div className="flex flex-col gap-3 pt-1">
        {/* Team */}
        <div className="rounded-[11px] border p-3" style={{ borderColor: 'var(--color-surface)' }}>
          <SubCardHead title="Team" tag="Contact page" onPreview={() => jump('contact')} />
          <div className="flex flex-col gap-2.5">
            {s.teamMembers.map((m, i) => (
              <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}
                  >
                    {m.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Member {i + 1}</span>
                  <button type="button" aria-label={`Remove member ${i + 1}`} onClick={() => s.removeTeamMember(i)} style={{ color: 'var(--color-text-muted)' }}>
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <input value={m.name} onChange={(e) => s.updateTeamMember(i, 'name', e.target.value)} placeholder="Name" className={compactFieldClass} style={fieldStyle} />
                  <input value={m.role} onChange={(e) => s.updateTeamMember(i, 'role', e.target.value)} placeholder="Role" className={compactFieldClass} style={fieldStyle} />
                  <textarea rows={2} value={m.bio} onChange={(e) => s.updateTeamMember(i, 'bio', e.target.value)} placeholder="Short bio" className={`${compactFieldClass} resize-none`} style={fieldStyle} />
                  <input value={m.photo_url} onChange={(e) => s.updateTeamMember(i, 'photo_url', e.target.value)} placeholder="Photo URL" className={compactFieldClass} style={fieldStyle} />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={s.addTeamMember}
            className="mt-2.5 w-full rounded-lg border border-dashed py-2 text-xs font-semibold"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', backgroundColor: 'var(--color-background)' }}
          >
            + Add member
          </button>
        </div>

        {/* Pricing */}
        <div className="rounded-[11px] border p-3" style={{ borderColor: 'var(--color-surface)' }}>
          <SubCardHead title="Pricing" tag="Pricing page" onPreview={() => jump('pricing')} />
          <div className="flex flex-col gap-2.5">
            {s.pricingPackages.map((p, i) => (
              <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {p.name.trim() || `Package ${i + 1}`}
                    {p.is_featured && <span className="ml-1.5 text-[9.5px] font-bold" style={{ color: 'var(--color-primary)' }}>POPULAR</span>}
                  </span>
                  <button type="button" aria-label={`Remove package ${i + 1}`} onClick={() => s.removePricingPackage(i)} style={{ color: 'var(--color-text-muted)' }}>
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <input value={p.name} onChange={(e) => s.updatePricingPackage(i, 'name', e.target.value)} placeholder="Name" className={compactFieldClass} style={fieldStyle} />
                  <div className="flex gap-1.5">
                    <input value={p.price} onChange={(e) => s.updatePricingPackage(i, 'price', e.target.value)} placeholder="Price" className={`${compactFieldClass} min-w-0 flex-1`} style={fieldStyle} />
                    <input value={p.duration} onChange={(e) => s.updatePricingPackage(i, 'duration', e.target.value)} placeholder="Duration" className={`${compactFieldClass} min-w-0 flex-1`} style={fieldStyle} />
                  </div>
                  <textarea rows={2} value={p.features} onChange={(e) => s.updatePricingPackage(i, 'features', e.target.value)} placeholder="One feature per line" className={`${compactFieldClass} resize-none`} style={fieldStyle} />
                  <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <input type="checkbox" checked={p.is_featured} onChange={(e) => s.updatePricingFeatured(i, e.target.checked)} />
                    Featured (Most Popular)
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={s.addPricingPackage}
            className="mt-2.5 w-full rounded-lg border border-dashed py-2 text-xs font-semibold"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', backgroundColor: 'var(--color-background)' }}
          >
            + Add package
          </button>
        </div>

        {/* Location */}
        <div className="rounded-[11px] border p-3" style={{ borderColor: 'var(--color-surface)' }}>
          <SubCardHead title="Location" tag="Locate page" onPreview={() => jump('locate')} />
          <input
            value={s.mapEmbedUrl}
            onChange={(e) => s.setMapEmbedUrl(e.target.value)}
            placeholder="Google Maps embed URL"
            className={`${compactFieldClass} mb-2`}
            style={fieldStyle}
          />
          <textarea
            rows={2}
            value={s.directions}
            onChange={(e) => s.setDirections(e.target.value)}
            placeholder="Landmarks & directions"
            className={`${compactFieldClass} resize-none`}
            style={fieldStyle}
          />
          <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            Google Maps → Share → Embed a map → copy the src URL.
          </p>
        </div>
      </div>
    </RailGroup>
  );
}
