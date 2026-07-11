'use client';

import { Image as ImageIcon, Upload, Crosshair } from 'lucide-react';
import { RailGroup } from './RailGroup';
import { useStudio } from './GymPageStudio';

export function PhotosGroup() {
  const s = useStudio();

  const onCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    s.handleAssetSelection(e.target.files?.[0], 'cover');
    e.target.value = '';
  };
  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    s.handleAssetSelection(e.target.files?.[0], 'logo');
    e.target.value = '';
  };

  return (
    <RailGroup
      id="photos"
      icon={<ImageIcon size={16} />}
      title="Photos"
      subtitle="Cover, logo & focal point"
      open={s.openGroups.photos}
      onToggle={() => s.toggleGroup('photos')}
      badge={
        <span
          className="mr-2 rounded-md px-1.5 py-[3px] text-[10.5px] font-bold tracking-wide"
          style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
        >
          START HERE
        </span>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        {/* Cover */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Cover photo</label>
            {s.coverUrl && (
              <button type="button" onClick={() => s.resetAsset('cover')} className="text-[11.5px] font-semibold" style={{ color: 'var(--color-danger)' }}>
                Remove
              </button>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); s.setIsDraggingCover(true); }}
            onDragLeave={() => s.setIsDraggingCover(false)}
            onDrop={(e) => {
              e.preventDefault();
              s.setIsDraggingCover(false);
              s.handleAssetSelection(e.dataTransfer.files?.[0], 'cover');
            }}
            className="relative h-[118px] w-full overflow-hidden rounded-xl border"
            style={{
              borderColor: s.isDraggingCover ? 'var(--color-primary)' : 'var(--color-surface)',
              backgroundColor: 'var(--color-background)',
              backgroundImage: s.coverUrl ? `url(${JSON.stringify(s.coverUrl)})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: `${s.coverFocal.x}% ${s.coverFocal.y}%`,
            }}
          >
            {s.coverUrl ? (
              <>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)' }} />
                <button
                  type="button"
                  onClick={() => { s.setFocalEditing(!s.focalEditing); s.setPreviewTab('home'); }}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
                  style={
                    s.focalEditing
                      ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }
                      : { backgroundColor: 'rgba(0,0,0,0.55)', color: 'var(--color-white)' }
                  }
                >
                  <Crosshair size={13} /> {s.focalEditing ? 'Done' : 'Adjust focal point'}
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                <ImageIcon size={22} />
                <span className="text-xs font-semibold">Add a cover photo</span>
              </div>
            )}

            {s.isUploadingCover && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <span className="text-xs font-semibold text-white">Uploading cover image…</span>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex items-center">
            <button
              type="button"
              onClick={() => s.coverInputRef.current?.click()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold"
              style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
            >
              <Upload size={13} /> Upload
            </button>
            <input ref={s.coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverFile} />
          </div>

          <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Fills the hero on desktop &amp; mobile. Drag the{' '}
            <b style={{ color: 'var(--color-text-secondary)' }}>focal point</b> on the preview so faces stay clear of the text.
          </p>
        </div>

        {/* Logo */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-surface)' }}>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Logo</label>
            {s.logoUrl && (
              <button type="button" onClick={() => s.resetAsset('logo')} className="text-[11.5px] font-semibold" style={{ color: 'var(--color-danger)' }}>
                Remove
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex h-[60px] w-[60px] flex-none items-center justify-center overflow-hidden rounded-2xl border"
              style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)' }}
            >
              {s.logoUrl ? (
                <img src={s.logoUrl} alt="Gym logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>None</span>
              )}
            </div>
            <div className="flex-1">
              <button
                type="button"
                onClick={() => s.logoInputRef.current?.click()}
                className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
              >
                <Upload size={13} /> {s.logoUrl ? 'Replace' : 'Upload'}
              </button>
              <input ref={s.logoInputRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
              <p className="text-[11.5px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                {s.isUploadingLogo ? 'Uploading logo…' : 'Shows in the nav, hero & signup. A square mark reads best.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </RailGroup>
  );
}
