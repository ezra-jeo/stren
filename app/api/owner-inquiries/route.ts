import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendOwnerInquiryEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

const inquirySchema = z.object({
  gymName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(180),
  email: z.string().trim().toLowerCase().email().max(254),
  mobile: z.string().trim().min(7).max(30),
  memberCount: z.number().int().min(0).max(1_000_000).optional(),
  message: z.string().trim().max(2_000).optional().default(''),
  company: z.string().max(200).optional().default(''),
});

export async function POST(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientKey = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  if (!rateLimit(`owner-inquiry:${clientKey}`, 5, 60 * 60 * 1_000).success) {
    return NextResponse.json({ error: 'Too many inquiries. Please wait a while and try again.' }, { status: 429 });
  }

  const parsed = inquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 });
  }
  if (parsed.data.company) return NextResponse.json({ ok: true });

  const result = await sendOwnerInquiryEmail({
    gymName: parsed.data.gymName,
    contactName: parsed.data.contactName,
    location: parsed.data.location,
    email: parsed.data.email,
    mobile: parsed.data.mobile,
    memberCount: parsed.data.memberCount,
    message: parsed.data.message || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'We could not send your inquiry. Please try again.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
