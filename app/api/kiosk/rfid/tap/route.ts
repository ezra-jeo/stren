import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getMyAccess } from '@/lib/permissions-server';
import { rfidUidDigest } from '@/lib/rfid-server';

const schema = z.object({ uid: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid card.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const supabase = await createServerSupabaseClient();
  const access = await getMyAccess(supabase as never);
  if (!access.gymId || !access.permissions.has('kiosk:use') || !access.features.rfid_kiosk || !['owner', 'admin'].includes(access.role)) return NextResponse.json({ error: 'RFID kiosk unavailable.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let digest: string;
  try { ({ digest } = rfidUidDigest(parsed.data.uid)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'RFID unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const { data, error } = await (supabase as any).rpc('process_rfid_tap', { p_card_digest: digest, p_gym_id: access.gymId });
  if (error) return NextResponse.json({ error: 'Card was not recognized.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
