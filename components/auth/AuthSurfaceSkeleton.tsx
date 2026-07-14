import { SkeletonBlock } from '@/components/ui/loading-screen';

export function AuthSurfaceSkeleton() {
  return (
    <main className="auth-surface-skeleton" aria-label="Loading sign in">
      <p className="sr-only" role="status" aria-live="polite">Loading sign in…</p>
      <div className="auth-surface-skeleton-card stren-skeleton-wave" aria-hidden="true">
        <div className="space-y-5 p-7 sm:p-12">
          <SkeletonBlock className="h-10 w-56 rounded-xl" />
          <SkeletonBlock className="h-4 w-72 max-w-full rounded-md" />
          <div className="space-y-3 pt-5">
            <SkeletonBlock className="h-13 rounded-xl" />
            <SkeletonBlock className="h-13 rounded-xl" />
            <SkeletonBlock className="h-13 rounded-xl" />
            <SkeletonBlock className="h-13 rounded-xl" />
          </div>
        </div>
        <div className="auth-surface-skeleton-brand"><SkeletonBlock className="h-24 w-24 rounded-2xl" /><SkeletonBlock className="mt-5 h-9 w-32 rounded-lg" /></div>
      </div>
    </main>
  );
}
