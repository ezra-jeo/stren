'use client';

import { useState } from 'react';
import { Palette, Check, ShieldCheck, AlertTriangle } from 'lucide-react';
import { RailGroup } from './RailGroup';
import { useStudio } from './GymPageStudio';
import { contrastRatio, generatePalette, isValidHex } from '@/lib/brand-color';

const PRESETS = [
  { name: 'Grove', primary: '#2F7D5B', secondary: '#24302B' },
  { name: 'Terracotta', primary: '#C1653F', secondary: '#2B211C' },
  { name: 'Ocean', primary: '#2C6E8F', secondary: '#1B2932' },
  { name: 'Ember', primary: '#B0473C', secondary: '#2A1E1C' },
];

export function BrandStyleGroup() {
  const s = useStudio();
  const [seed, setSeed] = useState(() => (isValidHex(s.brandColor) ? s.brandColor : '#D4956A'));
  const [showCustom, setShowCustom] = useState(false);

  const ramp = generatePalette(seed);
  const ratio = contrastRatio('#FFFFFF', isValidHex(s.brandColor) ? s.brandColor : '#D4956A');

  const contrast =
    ratio >= 4.5
      ? { tone: 'success' as const, icon: <ShieldCheck size={16} />, text: 'Great contrast — white button text is easy to read on your color.' }
      : ratio >= 3
        ? { tone: 'success' as const, icon: <ShieldCheck size={16} />, text: 'Readable — white button text works on your color.' }
        : { tone: 'warning' as const, icon: <AlertTriangle size={16} />, text: 'Low contrast — white text is hard to read. Pick a deeper shade below.' };

  const twoTone = (
    <span className="mr-1 inline-flex overflow-hidden rounded-md" style={{ boxShadow: '0 0 0 1px var(--color-surface)' }}>
      <span className="h-5 w-5" style={{ backgroundColor: isValidHex(s.brandColor) ? s.brandColor : '#D4956A' }} />
      <span className="h-5 w-5" style={{ backgroundColor: isValidHex(s.secondaryColor) ? s.secondaryColor : '#2C2C2C' }} />
    </span>
  );

  return (
    <RailGroup
      id="brand"
      icon={<Palette size={16} />}
      title="Brand style"
      subtitle="Colors, no hex required"
      open={s.openGroups.brand}
      onToggle={() => s.toggleGroup('brand')}
      rightSlot={twoTone}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <div className="mb-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Pick a palette</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => {
              const active = p.primary.toLowerCase() === s.brandColor.toLowerCase() && p.secondary.toLowerCase() === s.secondaryColor.toLowerCase();
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => { s.setBrandColor(p.primary); s.setSecondaryColor(p.secondary); setSeed(p.primary); }}
                  className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2"
                  style={{ borderColor: active ? 'var(--color-primary)' : 'var(--color-surface)', backgroundColor: 'var(--color-white)' }}
                >
                  <span className="inline-flex overflow-hidden rounded-md">
                    <span className="h-5 w-5" style={{ backgroundColor: p.primary }} />
                    <span className="h-5 w-5" style={{ backgroundColor: p.secondary }} />
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                  {active && <Check size={15} className="ml-auto" style={{ color: 'var(--color-primary)' }} />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2.5 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Fine-tune the main color</div>
          <div className="flex gap-1.5">
            {ramp.map((hex) => {
              const active = hex.toLowerCase() === s.brandColor.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  aria-label={`Use ${hex}`}
                  onClick={() => s.setBrandColor(hex)}
                  className="h-9 flex-1 rounded-lg"
                  style={{ backgroundColor: hex, boxShadow: active ? '0 0 0 2px var(--color-text-primary)' : '0 0 0 1px var(--color-surface)' }}
                />
              );
            })}
          </div>
        </div>

        <div
          className="flex items-start gap-2 rounded-[10px] px-3 py-2.5"
          style={{
            backgroundColor: contrast.tone === 'success' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
            color: contrast.tone === 'success' ? 'var(--color-success)' : 'var(--color-warning)',
          }}
        >
          <span className="mt-0.5 flex-none">{contrast.icon}</span>
          <span className="text-xs leading-snug">{contrast.text}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="self-start text-[11.5px] font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showCustom ? 'Hide custom color' : 'Advanced: custom color'}
        </button>

        {showCustom && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className="mb-1 block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Main</label>
                <input
                  value={s.brandColor}
                  onChange={(e) => { s.setBrandColor(e.target.value); if (isValidHex(e.target.value)) setSeed(e.target.value); }}
                  className="w-full rounded-lg border px-2.5 py-2 font-mono text-[12.5px] outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-white)', color: 'var(--color-text-primary)' }}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Deep</label>
                <input
                  value={s.secondaryColor}
                  onChange={(e) => s.setSecondaryColor(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 font-mono text-[12.5px] outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-white)', color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>
            {s.brandColorError && <p className="text-[11px]" style={{ color: 'var(--color-danger)' }}>{s.brandColorError}</p>}
            {s.secondaryColorError && <p className="text-[11px]" style={{ color: 'var(--color-danger)' }}>{s.secondaryColorError}</p>}
          </div>
        )}
      </div>
    </RailGroup>
  );
}
