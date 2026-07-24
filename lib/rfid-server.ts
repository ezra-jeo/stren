import 'server-only';
import { createHmac } from 'node:crypto';
import { normalizeRfidUid } from './rfid';

export function rfidUidDigest(rawUid: unknown): { digest: string; maskedId: string } {
  const uid = normalizeRfidUid(rawUid);
  const secret = process.env.RFID_UID_HMAC_SECRET;
  if (!uid) throw new Error('Invalid RFID card.');
  if (!secret) throw new Error('RFID is not configured.');
  return {
    digest: createHmac('sha256', secret).update(uid, 'utf8').digest('hex'),
    maskedId: `•••• ${uid.slice(-4)}`,
  };
}
