import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendOwnerInquiryEmailMock = vi.fn();
const rateLimitMock = vi.fn();
vi.mock('@/lib/email', () => ({
  sendOwnerInquiryEmail: (...args: unknown[]) => sendOwnerInquiryEmailMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

import { POST } from '@/app/api/owner-inquiries/route';

beforeEach(() => {
  sendOwnerInquiryEmailMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockReturnValue({ success: true, remaining: 4 });
});

describe('POST /api/owner-inquiries', () => {
  it('validates and delivers a public owner inquiry through the existing email provider', async () => {
    sendOwnerInquiryEmailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const request = new Request('https://stren.app/api/owner-inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({
        gymName: 'Iron House',
        contactName: 'Alex Cruz',
        location: 'Quezon City',
        email: 'alex@example.com',
        mobile: '+639171234567',
        memberCount: 120,
        message: 'We need help importing records.',
        company: '',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendOwnerInquiryEmailMock).toHaveBeenCalledWith(expect.objectContaining({ gymName: 'Iron House', email: 'alex@example.com' }));
  });

  it('rejects malformed requests without sending an email', async () => {
    const response = await POST(new Request('https://stren.app/api/owner-inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gymName: 'x' }),
    }));

    expect(response.status).toBe(400);
    expect(sendOwnerInquiryEmailMock).not.toHaveBeenCalled();
  });

  it('rate-limits repeated public submissions', async () => {
    rateLimitMock.mockReturnValue({ success: false, remaining: 0 });
    const response = await POST(new Request('https://stren.app/api/owner-inquiries', { method: 'POST' }));
    expect(response.status).toBe(429);
    expect(sendOwnerInquiryEmailMock).not.toHaveBeenCalled();
  });

  it('returns a clear retryable failure when email delivery fails', async () => {
    sendOwnerInquiryEmailMock.mockResolvedValue({ ok: false, error: 'provider unavailable' });
    const response = await POST(new Request('https://stren.app/api/owner-inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gymName: 'Iron House',
        contactName: 'Alex Cruz',
        location: 'Quezon City',
        email: 'alex@example.com',
        mobile: '+639171234567',
      }),
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'We could not send your inquiry. Please try again.' });
  });
});
