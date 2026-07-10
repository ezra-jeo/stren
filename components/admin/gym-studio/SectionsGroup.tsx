'use client';

import { LayoutList, X } from 'lucide-react';
import { RailGroup, PillToggle } from './RailGroup';
import { useStudio } from './GymPageStudio';
import { compactFieldClass, fieldStyle } from './studio-styles';

function SubCard({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-[11px] border p-3" style={{ borderColor: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        <PillToggle on={on} onLabel="Shown" offLabel="Hidden" ariaLabel={`${title} visibility`} onClick={onToggle} />
      </div>
      {on && children}
    </div>
  );
}

export function SectionsGroup() {
  const s = useStudio();

  return (
    <RailGroup
      id="sections"
      icon={<LayoutList size={16} />}
      title="Home sections"
      subtitle="Amenities, hours, contact"
      open={s.openGroups.sections}
      onToggle={() => s.toggleGroup('sections')}
    >
      <div className="flex flex-col gap-3 pt-1">
        <SubCard title="Amenities" on={s.sectionVisibility.amenities} onToggle={() => s.toggleSection('amenities')}>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.amenities.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
              >
                {a}
                <button type="button" aria-label={`Remove ${a}`} onClick={() => s.removeAmenity(a)} className="inline-flex">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <input
              value={s.amenityInput}
              onChange={(e) => s.setAmenityInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); s.addAmenity(); } }}
              placeholder="Add amenity"
              className={compactFieldClass}
              style={fieldStyle}
            />
            <button
              type="button"
              onClick={s.addAmenity}
              className="rounded-lg px-3 text-[12.5px] font-semibold"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
            >
              Add
            </button>
          </div>
        </SubCard>

        <SubCard title="Opening hours" on={s.sectionVisibility.hours} onToggle={() => s.toggleSection('hours')}>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {s.days.map((day) => (
              <div key={day} className="grid items-center gap-2" style={{ gridTemplateColumns: '78px 1fr' }}>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{day}</span>
                <input
                  value={s.operatingHours[day]}
                  onChange={(e) => s.setHour(day, e.target.value)}
                  placeholder="Closed"
                  className={compactFieldClass}
                  style={fieldStyle}
                />
              </div>
            ))}
          </div>
        </SubCard>

        <SubCard title="Contact & social" on={s.sectionVisibility.contact} onToggle={() => s.toggleSection('contact')}>
          <div className="mt-2.5 flex flex-col gap-2">
            <input value={s.address} onChange={(e) => s.setAddress(e.target.value)} placeholder="Address" className={compactFieldClass} style={fieldStyle} />
            <input value={s.phone} onChange={(e) => s.setPhone(e.target.value)} placeholder="Phone" className={compactFieldClass} style={fieldStyle} />
            <input value={s.socialLinks.facebook} onChange={(e) => s.setSocial('facebook', e.target.value)} placeholder="Facebook" className={compactFieldClass} style={fieldStyle} />
            <div className="flex gap-1.5">
              <input value={s.socialLinks.instagram} onChange={(e) => s.setSocial('instagram', e.target.value)} placeholder="Instagram" className={`${compactFieldClass} min-w-0 flex-1`} style={fieldStyle} />
              <input value={s.socialLinks.website} onChange={(e) => s.setSocial('website', e.target.value)} placeholder="Website" className={`${compactFieldClass} min-w-0 flex-1`} style={fieldStyle} />
            </div>
          </div>
        </SubCard>
      </div>
    </RailGroup>
  );
}
