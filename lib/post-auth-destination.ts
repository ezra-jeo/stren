import type { MyGym } from './types';

export interface PostAuthDestination {
  path: string;
  activateGymId: string | null;
}

function rolePath(role: MyGym['role']): '/admin' | '/member' {
  return role === 'member' ? '/member' : '/admin';
}

export function choosePostAuthDestination(
  gyms: MyGym[],
  activeGymId: string | null,
  requestedGymCode?: string,
): PostAuthDestination {
  const activeGyms = gyms.filter((gym) => gym.status === 'active');
  const requestedCode = requestedGymCode?.trim().toLowerCase();

  if (requestedCode) {
    const requested = activeGyms.find((gym) => gym.code.toLowerCase() === requestedCode);
    if (requested) return { path: rolePath(requested.role), activateGymId: requested.gymId };
    return { path: `/gyms?join=${encodeURIComponent(requestedCode)}`, activateGymId: null };
  }

  const active = activeGyms.find((gym) => gym.gymId === activeGymId);
  if (active) return { path: rolePath(active.role), activateGymId: null };
  if (activeGyms.length === 1) {
    return { path: rolePath(activeGyms[0].role), activateGymId: activeGyms[0].gymId };
  }
  return { path: '/gyms', activateGymId: null };
}
