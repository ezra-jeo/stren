import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock, push: vi.fn() }),
}));

const refreshMyGymsMock = vi.fn();
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ refreshMyGyms: refreshMyGymsMock }) }));

const createGymActionMock = vi.fn();
vi.mock('@/lib/auth-actions', () => ({ createGymAction: (...a: unknown[]) => createGymActionMock(...a) }));

import NewGymPage from '@/app/gyms/new/page';
import { readableCreateGymError } from '@/lib/create-gym-error-copy';

beforeEach(() => {
  replaceMock.mockReset();
  refreshMock.mockReset();
  refreshMyGymsMock.mockReset();
  createGymActionMock.mockReset();
});

describe('readableCreateGymError', () => {
  it('maps each create_gym guard to plain language', () => {
    expect(readableCreateGymError('That gym code is reserved')).toMatch(/reserved/i);
    expect(readableCreateGymError('That gym code is already taken')).toMatch(/already taken/i);
    expect(readableCreateGymError('Gym code must be 3-32 lowercase letters, numbers, or single hyphens')).toMatch(/lowercase/i);
    expect(readableCreateGymError('Publish one of your gyms before creating another')).toMatch(/publish one of your gyms/i);
  });
});

describe('/gyms/new', () => {
  it('creates a gym and lands on /admin', async () => {
    const user = userEvent.setup();
    createGymActionMock.mockResolvedValue({ gymId: 'g1', code: 'iron-house' });
    render(<NewGymPage />);

    await user.type(screen.getByLabelText(/gym name/i), 'Iron House');
    await user.type(screen.getByLabelText(/gym code/i), 'iron-house');
    await user.click(screen.getByRole('button', { name: /create gym/i }));

    await waitFor(() => expect(createGymActionMock).toHaveBeenCalledWith({ name: 'Iron House', code: 'iron-house' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin'));
    expect(refreshMyGymsMock).toHaveBeenCalled();
  });

  it('surfaces the reserved-code guard in plain language', async () => {
    const user = userEvent.setup();
    createGymActionMock.mockResolvedValue({ error: 'That gym code is reserved' });
    render(<NewGymPage />);

    await user.type(screen.getByLabelText(/gym name/i), 'Admin');
    await user.type(screen.getByLabelText(/gym code/i), 'admin');
    await user.click(screen.getByRole('button', { name: /create gym/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/reserved/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
