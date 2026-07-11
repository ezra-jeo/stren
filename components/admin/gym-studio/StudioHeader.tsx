'use client';

import { ExternalLink } from 'lucide-react';
import { useStudio } from './GymPageStudio';

export function StudioHeader() {
  const s = useStudio();
  const uploading = s.isUploadingLogo || s.isUploadingCover;
  const publishBlocked = !s.isPublished && !s.hasTagline;

  const dirtyText = s.isSaving ? 'Saving…' : s.dirty ? 'Unsaved changes' : 'All changes saved';
  const dirtyColor = s.isSaving
    ? 'var(--color-text-muted)'
    : s.dirty
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';

  return (
    <div className="flex flex-wrap items-center gap-4 border-b px-6 py-4" style={{ borderColor: 'var(--color-surface)' }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[23px] font-extrabold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
            Gym Page
          </h1>
          {s.gymCode && (
            <span className="rounded-md px-2 py-[3px] font-mono text-[11.5px]" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-muted)' }}>
              {s.gymCode}
            </span>
          )}
          <StatusPill live={s.isPublished} />
        </div>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          Guided edits on a polished Stren page — you choose the content, we keep the layout sharp.
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3.5">
        <span className="text-[13px] font-medium" style={{ color: dirtyColor }}>{dirtyText}</span>

        {s.gymCode && (
          <a
            href={`/gym/${encodeURIComponent(s.gymCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            View public page <ExternalLink size={14} />
          </a>
        )}

        <button
          type="button"
          onClick={() => void s.save()}
          disabled={!s.dirty || s.isSaving || uploading}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-60"
          style={
            s.dirty && !s.isSaving
              ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }
              : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
          }
        >
          {s.isSaving ? 'Saving…' : 'Save changes'}
        </button>

        {s.canPublish ? (
          <button
            type="button"
            onClick={() => void s.save(!s.isPublished)}
            disabled={s.isSaving || uploading || publishBlocked}
            title={publishBlocked ? 'Add a tagline first' : undefined}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={
              s.isPublished
                ? { backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface)' }
                : { backgroundColor: 'var(--color-success)', color: 'var(--color-white)' }
            }
          >
            {s.isPublished ? 'Unpublish' : 'Publish'}
          </button>
        ) : (
          <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Only the owner can publish
          </span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{
        backgroundColor: live ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
        color: live ? 'var(--color-success)' : 'var(--color-warning)',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: live ? 'var(--color-success)' : 'var(--color-warning)' }} />
      {live ? 'Live' : 'Hidden'}
    </span>
  );
}
