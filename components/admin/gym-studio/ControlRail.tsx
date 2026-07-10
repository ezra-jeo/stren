'use client';

import { EssentialsGroup } from './EssentialsGroup';
import { PhotosGroup } from './PhotosGroup';
import { BrandStyleGroup } from './BrandStyleGroup';
import { SectionsGroup } from './SectionsGroup';
import { SubpagesGroup } from './SubpagesGroup';
import { FeaturesGroup } from './FeaturesGroup';

/** The stacked group cards. Full-width on mobile; a fixed-width scrolling rail on desktop. */
export function ControlRail() {
  return (
    <div className="flex flex-col gap-3.5">
      <EssentialsGroup />
      <PhotosGroup />
      <BrandStyleGroup />
      <SectionsGroup />
      <SubpagesGroup />
      <FeaturesGroup />
      <p className="mx-2 mt-1 text-center text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Layout, fonts &amp; spacing are handled by Stren — you focus on the content.
      </p>
    </div>
  );
}
