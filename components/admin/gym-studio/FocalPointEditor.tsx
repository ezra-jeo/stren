'use client';

import { useRef, useState } from 'react';
import { useStudio } from './GymPageStudio';
import { focalFromPointer } from '@/lib/focal';

const SAFE_AREA = {
  mobile: { top: '46%', left: '8%', right: '8%', bottom: '6%' },
  desktop: { top: '34%', left: '4%', right: '46%', bottom: '10%' },
} as const;

/**
 * Focal-point overlay injected over the hero (§7.5). Drag or arrow-key nudge;
 * metadata only — never re-crops the image.
 */
export function FocalPointEditor({ device }: { device: 'desktop' | 'mobile' }) {
  const s = useStudio();
  const layerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const editing = s.focalEditing;
  const showSafe = s.showSafeArea || editing;
  const focal = s.coverFocal;
  const safe = SAFE_AREA[device];

  const update = (clientX: number, clientY: number) => {
    const el = layerRef.current;
    if (!el) return;
    s.setFocal(focalFromPointer(el.getBoundingClientRect(), clientX, clientY));
  };

  return (
    <>
      {editing && (
        <div
          ref={layerRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDragging(true);
            update(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => { if (dragging) update(e.clientX, e.clientY); }}
          onPointerUp={() => setDragging(false)}
          className="absolute inset-0 z-40"
          style={{ cursor: 'crosshair', touchAction: 'none', backgroundColor: 'rgba(0,0,0,0.18)' }}
        />
      )}

      {showSafe && (
        <div
          className="pointer-events-none absolute z-[41] rounded-[10px]"
          style={{ ...safe, border: '1.5px dashed rgba(255,255,255,0.85)' }}
        >
          <span
            className="absolute -top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
          >
            Text sits here
          </span>
        </div>
      )}

      <button
        type="button"
        role="slider"
        aria-label="Cover focal point"
        aria-valuetext={`X ${focal.x}%, Y ${focal.y}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={focal.x}
        onClick={() => s.setFocalEditing(!editing)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); s.nudgeFocalBy(-1, 0); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); s.nudgeFocalBy(1, 0); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); s.nudgeFocalBy(0, -1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); s.nudgeFocalBy(0, 1); }
          else if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); s.setFocalEditing(false); }
        }}
        className="absolute z-[42] flex h-[26px] w-[26px] items-center justify-center rounded-full"
        style={{
          left: `${focal.x}%`,
          top: `${focal.y}%`,
          transform: 'translate(-50%, -50%)',
          border: '2.5px solid #fff',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.4)',
          transition: dragging ? 'none' : 'left 0.12s, top 0.12s',
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#fff' }} />
      </button>

      {editing && (
        <div
          className="absolute left-1/2 top-3.5 z-[43] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: 'rgba(20,16,12,0.82)', whiteSpace: 'nowrap' }}
        >
          Drag to set the focal point
          <button
            type="button"
            onClick={() => s.setFocalEditing(false)}
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: '#fff', color: '#1a1a1a' }}
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
