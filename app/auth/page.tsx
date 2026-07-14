'use client';

import { Suspense } from 'react';
import { UnifiedAuthSurface } from '@/components/auth/UnifiedAuthSurface';
import { AuthSurfaceSkeleton } from '@/components/auth/AuthSurfaceSkeleton';

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthSurfaceSkeleton />}>
      <UnifiedAuthSurface />
    </Suspense>
  );
}
