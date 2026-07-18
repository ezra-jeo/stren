import { createServerSupabaseClient } from '@/lib/supabase-server';
import { hashClaimToken } from '@/lib/claim-invites';
import { ClaimConfirmClient } from '@/components/superadmin/ClaimConfirmClient';

interface PageProps {
  params: Promise<{ token: string }> | { token: string };
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

export default async function ClaimPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('get_claim_invite_preview', { p_token_hash: hashClaimToken(token) });
  const preview = data as { state: string; gymName?: string; invitedEmail?: string; expiresAt?: string } | null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-md w-full rounded-2xl border p-6 space-y-4" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        {!preview || preview.state === 'not_found' ? (
          <>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Invitation not found</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This claim link isn&rsquo;t valid. Check the link in your email, or ask your Stren contact to resend it.
            </p>
          </>
        ) : preview.state === 'used' ? (
          <>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Already claimed</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This invitation for {preview.gymName} has already been used.
            </p>
          </>
        ) : preview.state === 'expired' ? (
          <>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Invitation expired</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This invitation for {preview.gymName} has expired. Ask your Stren contact to resend it.
            </p>
          </>
        ) : preview.state === 'superseded' ? (
          <>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Invitation replaced</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              A newer invitation for {preview.gymName} was sent. Use the most recent email you received.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Claim ownership of {preview.gymName}
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Invited to {maskEmail(preview.invitedEmail ?? '')}
            </p>
            <ClaimConfirmClient token={token} gymName={preview.gymName ?? 'this gym'} invitedEmail={maskEmail(preview.invitedEmail ?? '')} />
          </>
        )}
      </div>
    </div>
  );
}
