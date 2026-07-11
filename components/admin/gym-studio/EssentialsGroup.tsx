'use client';

import { SlidersHorizontal } from 'lucide-react';
import { RailGroup, PillToggle } from './RailGroup';
import { useStudio } from './GymPageStudio';
import { fieldClass, fieldStyle, labelStyle } from './studio-styles';

export function EssentialsGroup() {
  const s = useStudio();
  const taglineTrimmed = s.tagline.trim().length;

  return (
    <RailGroup
      id="essentials"
      icon={<SlidersHorizontal size={16} />}
      title="Essentials"
      subtitle="Tagline & description"
      open={s.openGroups.essentials}
      onToggle={() => s.toggleGroup('essentials')}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div
          className="flex items-center justify-between gap-3 rounded-[10px] border px-3 py-3"
          style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)' }}
        >
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Public visibility</div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>A tagline is required to publish.</div>
          </div>
          <PillToggle
            on={s.isPublished}
            onLabel="Published"
            offLabel="Hidden"
            ariaLabel="Public visibility"
            onClick={s.togglePublish}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="studio-tagline" className="text-xs font-semibold" style={labelStyle}>Tagline</label>
            <span className="text-[11px]" style={{ color: taglineTrimmed === 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
              {s.tagline.length}/120
            </span>
          </div>
          <input
            id="studio-tagline"
            value={s.tagline}
            maxLength={120}
            onChange={(e) => s.setTagline(e.target.value)}
            placeholder="Your gym's one-liner"
            className={fieldClass}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="studio-description" className="mb-1.5 block text-xs font-semibold" style={labelStyle}>Short description</label>
          <textarea
            id="studio-description"
            rows={3}
            value={s.description}
            onChange={(e) => s.setDescription(e.target.value)}
            placeholder="What makes your gym special"
            className={`${fieldClass} resize-none leading-relaxed`}
            style={fieldStyle}
          />
        </div>
      </div>
    </RailGroup>
  );
}
