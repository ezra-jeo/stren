import Link from 'next/link';
import { Eye } from 'lucide-react';

const TITLES: Record<string, string> = { feed: 'Gym activity', ranks: 'Latest ranks', settings: 'Settings' };

export default async function DemoPreviewSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return (
    <div className="member-page">
      <section className="member-surface grid min-h-80 place-content-center p-8 text-center">
        <span className="member-icon-bubble mx-auto" aria-hidden="true"><Eye size={21} /></span>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-(--color-text-primary)">{TITLES[section] ?? 'Member preview'}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-(--color-text-secondary)">This is a preview. Nothing here affects your account.</p>
        <p className="mt-1 text-xs text-(--color-text-muted)">This area is not interactive in Demo Mode.</p>
        <Link href="/member/demo" className="mx-auto mt-5 inline-flex min-h-11 items-center rounded-xl bg-(--color-primary) px-4 text-sm font-semibold text-white">Back to Demo Home</Link>
      </section>
    </div>
  );
}
