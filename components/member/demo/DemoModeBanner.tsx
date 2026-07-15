'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DemoModeBanner() {
  const router = useRouter();
  return (
    <aside className="demo-mode-banner" aria-label="Demo Mode status" role="status">
      <div className="min-w-0">
        <strong>Demo Mode · Sample data</strong>
        <span>Nothing here affects your account.</span>
      </div>
      <button type="button" onClick={() => router.replace('/gyms')}>
        <LogOut size={16} aria-hidden="true" />
        Exit demo
      </button>
    </aside>
  );
}
