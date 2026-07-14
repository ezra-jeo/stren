import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KIOSK_RESULT_CYCLE_MS } from '@/lib/kiosk-scan-gate';

const mocks = vi.hoisted(() => {
  let success: ((text: string) => void) | null = null;
  let empty: (() => void) | null = null;
  const scannerStart = vi.fn(async (_source: unknown, _config: unknown, onSuccess: (text: string) => void, onEmpty: () => void) => {
    success = onSuccess;
    empty = onEmpty;
  });
  const scannerStop = vi.fn(async () => undefined);
  const scannerClear = vi.fn();
  const cameraTrackStop = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: cameraTrackStop }] }));
  const rpc = vi.fn();
  const feedback = vi.fn();

  class Html5Qrcode {
    start = scannerStart;
    stop = scannerStop;
    clear = scannerClear;
  }

  return {
    Html5Qrcode,
    scannerStart,
    scannerStop,
    scannerClear,
    cameraTrackStop,
    getUserMedia,
    rpc,
    feedback,
    emitScan: (value: string) => success?.(value),
    emitEmptyFrame: () => empty?.(),
    resetCallbacks: () => { success = null; empty = null; },
    nextCheckin: { data: { action: 'checked_in', attendance_id: 'attendance-1', member_name: 'Bon Aquino' }, error: null } as { data: unknown; error: unknown },
  };
});

vi.mock('html5-qrcode', () => ({ Html5Qrcode: mocks.Html5Qrcode }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ activeGymId: 'gym-1' }) }));
vi.mock('@/lib/kiosk-feedback', () => ({ playKioskFeedback: mocks.feedback }));

import KioskPage from '@/app/kiosk/page';

function configureRpc() {
  mocks.rpc.mockImplementation((name: string) => {
    if (name === 'kiosk_access_allowed') return Promise.resolve({ data: true, error: null });
    if (name === 'kiosk_get_occupancy') return Promise.resolve({ data: 24, error: null });
    if (name === 'kiosk_checkin') return Promise.resolve(mocks.nextCheckin);
    if (name === 'kiosk_search_members') return Promise.resolve({ data: [{ id: 'member-1', name: 'Bon Aquino', email: 'bon.aquino@example.com' }], error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe('kiosk terminal', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.scannerStart.mockClear();
    mocks.scannerStop.mockClear();
    mocks.scannerClear.mockClear();
    mocks.cameraTrackStop.mockClear();
    mocks.getUserMedia.mockClear();
    mocks.feedback.mockClear();
    mocks.resetCallbacks();
    mocks.nextCheckin = { data: { action: 'checked_in', attendance_id: 'attendance-1', member_name: 'Bon Aquino' }, error: null };
    configureRpc();
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: mocks.getUserMedia }, configurable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the pinned gym for a valid QR, updates occupancy after confirmation, and gives one feedback event', async () => {
    render(<KioskPage />);
    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalled());

    fireEvent.pointerDown(window);
    await act(async () => { mocks.emitScan('member-qr'); });

    await screen.findByRole('heading', { name: 'Checked in successfully' });
    expect(mocks.rpc).toHaveBeenCalledWith('kiosk_checkin', { p_qr_code: 'member-qr', p_gym_id: 'gym-1' });
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent?.includes('Bon checked in at') === true)).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(mocks.feedback).toHaveBeenCalledWith('success', true);

    await act(async () => { mocks.emitScan('member-qr'); });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'kiosk_checkin')).toHaveLength(1);
    expect(mocks.feedback).toHaveBeenCalledTimes(1);
  });

  it('automatically returns to an already-warm scanner within the result timing budget', async () => {
    vi.useFakeTimers();
    render(<KioskPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(mocks.scannerStart).toHaveBeenCalledTimes(1);

    await act(async () => { mocks.emitScan('member-qr'); await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'Checked in successfully' })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(KIOSK_RESULT_CYCLE_MS); });
    expect(screen.getByRole('heading', { name: 'Check in or check out' })).toBeInTheDocument();
    expect(mocks.scannerStart).toHaveBeenCalledTimes(1);

    mocks.nextCheckin = { data: { action: 'checked_out', attendance_id: 'attendance-1', member_name: 'Bon Aquino' }, error: null };
    await act(async () => {
      mocks.emitEmptyFrame();
      mocks.emitEmptyFrame();
      mocks.emitEmptyFrame();
      mocks.emitEmptyFrame();
      mocks.emitScan('member-qr');
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Checked out successfully' })).toBeInTheDocument();
  });

  it('shows inactive membership without treating it as a successful attendance action', async () => {
    mocks.nextCheckin = { data: { error: 'membership_inactive' }, error: null };
    render(<KioskPage />);
    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalled());

    await act(async () => { mocks.emitScan('inactive-member-qr'); });
    expect(await screen.findByRole('heading', { name: 'Membership inactive' })).toBeInTheDocument();
    expect(mocks.feedback).toHaveBeenCalledWith('error', false);
  });

  it('explains when a QR is not recognized and offers safe next actions', async () => {
    mocks.nextCheckin = { data: { error: 'unknown_qr' }, error: null };
    render(<KioskPage />);
    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalled());

    await act(async () => { mocks.emitScan('unknown-qr'); });
    expect(await screen.findByRole('heading', { name: 'QR code not recognized' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try scanning again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use manual search' })).toBeInTheDocument();
  });

  it('shows an honest offline state when a scan request cannot reach the backend', async () => {
    mocks.nextCheckin = { data: null, error: new Error('Failed to fetch') };
    render(<KioskPage />);
    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalled());

    await act(async () => { mocks.emitScan('member-qr'); });
    expect(await screen.findByRole('heading', { name: 'No connection' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Checked in successfully' })).not.toBeInTheDocument();
  });

  it('explains camera permission denial and offers recovery without falling back to a fake camera', async () => {
    mocks.scannerStart.mockRejectedValueOnce(new Error('NotAllowedError: permission denied'));
    render(<KioskPage />);

    expect(await screen.findByRole('heading', { name: 'Camera permission needed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Search' })).toBeInTheDocument();
    expect(mocks.scannerStart).toHaveBeenCalledTimes(1);
  });

  it('retries with default camera constraints when the preferred rear-camera constraint is rejected', async () => {
    mocks.scannerStart.mockRejectedValueOnce(new Error('OverconstrainedError: facingMode is unavailable'));
    render(<KioskPage />);

    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalledTimes(2));
    expect(mocks.scannerStart.mock.calls[0]?.[0]).toEqual({ facingMode: { ideal: 'environment' } });
    expect(mocks.scannerStart.mock.calls[1]?.[0]).toEqual({});
    expect(screen.getByText('Camera ready')).toBeInTheDocument();
  });

  it('warms and releases the browser camera before starting the QR scanner', async () => {
    mocks.scannerStart.mockImplementationOnce(async () => {
      if (mocks.getUserMedia.mock.calls.length === 0) throw new Error('Camera initialization timed out.');
      return null;
    });
    render(<KioskPage />);

    expect(await screen.findByText('Camera ready')).toBeInTheDocument();
    expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(mocks.cameraTrackStop).toHaveBeenCalledTimes(1);
  });

  it('uses the camera-compatible square stream ratio from the working kiosk', async () => {
    mocks.scannerStart.mockImplementationOnce(async (_source, config) => {
      if ((config as { aspectRatio?: number }).aspectRatio !== 1) {
        throw new Error('Camera initialization timed out.');
      }
      return null;
    });
    render(<KioskPage />);

    expect(await screen.findByText('Camera ready')).toBeInTheDocument();
    expect(mocks.scannerStart.mock.calls[0]?.[1]).toMatchObject({ aspectRatio: 1 });
  });

  it('explains when a camera is unavailable or already in use', async () => {
    mocks.scannerStart.mockRejectedValueOnce(new Error('NotReadableError: camera device is busy'));
    render(<KioskPage />);

    expect(await screen.findByRole('heading', { name: 'Camera unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/another tab or app may already be using it/i)).toBeInTheDocument();
    expect(mocks.scannerStart).toHaveBeenCalledTimes(1);
  });

  it('debounces a name or email lookup and masks the returned email address', async () => {
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(screen.getByRole('tab', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search members by name or email' }), 'bon@example.com');

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('kiosk_search_members', { p_query: 'bon@example.com', p_gym_id: 'gym-1' }));
    expect(await screen.findByText('Bon Aquino')).toBeInTheDocument();
    expect(screen.getByText('b•••••@example.com')).toBeInTheDocument();
    expect(screen.getByText(/manager must confirm any manual check-in/i)).toBeInTheDocument();
  });

  it('stops and clears the camera stream on unmount', async () => {
    const view = render(<KioskPage />);
    await waitFor(() => expect(mocks.scannerStart).toHaveBeenCalled());

    view.unmount();
    await waitFor(() => expect(mocks.scannerStop).toHaveBeenCalledTimes(1));
    expect(mocks.scannerClear).toHaveBeenCalledTimes(1);
  });
});
