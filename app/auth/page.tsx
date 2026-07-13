'use client';

import { Suspense } from 'react';
import { UnifiedAuthSurface } from '@/components/auth/UnifiedAuthSurface';

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-label="Loading Stren" />}>
      <UnifiedAuthSurface />
    </Suspense>
  );
}
