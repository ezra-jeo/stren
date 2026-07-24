import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getMyAccess } from '@/lib/permissions-server';
import { rfidUidDigest } from '@/lib/rfid-server';

const schema = z.object({ uid: z.string().min(1).max(128) });
async function authorized() {
  const supabase = await createServerSupabaseClient(); const access = await getMyAccess(supabase as never);
  return { supabase, access, allowed: Boolean(access.gymId && ['owner', 'admin'].includes(access.role) && access.permissions.has('members:manage')) };
}
export async function GET(_: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params; const { supabase, access, allowed } = await authorized();
  if (!allowed) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const { data, error } = await (supabase as any).rpc('get_member_rfid_card', { p_member_id: memberId, p_gym_id: access.gymId });
  return error ? NextResponse.json({ error: 'Could not load RFID card.' }, { status: 500 }) : NextResponse.json({ card: data });
}
export async function POST(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid card.' }, { status: 400 });
  const { memberId } = await params; const { supabase, access, allowed } = await authorized(); if (!allowed) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  let card; try { card = rfidUidDigest(parsed.data.uid); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'RFID unavailable.' }, { status: 503 }); }
  const { data, error } = await (supabase as any).rpc('assign_member_rfid_card', { p_member_id: memberId, p_card_digest: card.digest, p_masked_id: card.maskedId, p_gym_id: access.gymId });
  return error ? NextResponse.json({ error: 'Could not assign RFID card.' }, { status: 409 }) : NextResponse.json({ assigned: true, card: data, freshTapRequired: true });
}
