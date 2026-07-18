/**
 * lib/email.ts
 *
 * Onboarding email sender using Resend.
 * Generates a QR code PNG (base64) server-side and embeds it inline —
 * no external image hosting required.
 *
 * Requires:
 *   RESEND_API_KEY       — from resend.com dashboard
 *   RESEND_FROM_EMAIL    — verified sender address, e.g. "Stren <noreply@yourgym.com>"
 *
 * The `qrcode` package is already in package.json so no new install is needed for that.
 * Only Resend needs to be added:
 *   npm install resend
 */

import QRCode from "qrcode"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingEmailPayload {
  to: string
  memberName: string
  gymName: string
  qrPayload: string   // the raw stren://checkin/... string encoded into the QR
  setupLink: string   // delivered only by the server; never returned to staff
}

export interface StaffInvitationEmailPayload {
  to: string
  teammateName: string
  gymName: string
  setupLink: string
}

export interface PasswordResetEmailPayload {
  to: string
  resetLink: string
}

export interface OwnerInquiryEmailPayload {
  gymName: string
  contactName: string
  location: string
  email: string
  mobile: string
  memberCount?: number
  message?: string
}

export type SendResult = {
  ok: true
  messageId: string
} | {
  ok: false
  error: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getResendKey(): string {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error("RESEND_API_KEY is not set.")
  return key
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ??
    "Stren <noreply@mail.stren.app>"
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

/** Renders the QR payload to a base64 PNG data-URI (for inline embedding). */
async function generateQrBase64Png(payload: string): Promise<string> {
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    width: 240,
    margin: 2,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "M",
  })
  return png.toString("base64")
}

// ---------------------------------------------------------------------------
// Email HTML template
// ---------------------------------------------------------------------------

function buildEmailHtml(params: {
  memberName: string
  gymName: string
  accountEmail: string
  qrCid: string
  setupLink: string
}): string {
  const { memberName, gymName, accountEmail, qrCid, setupLink } = params

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${gymName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">
                ${gymName}
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;">
                Membership confirmation
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                Welcome, ${memberName}!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                Your membership at <strong>${gymName}</strong> is active.
                Your QR code is ready — use it to check in at the gym kiosk
                without needing to open an app.
              </p>

              <!-- QR code -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <div style="display:inline-block;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;padding:16px;">
                      <img
                        src="cid:${qrCid}"
                        alt="Your gym check-in QR code"
                        width="200"
                        height="200"
                        style="display:block;border:0;"
                      />
                    </div>
                    <p style="margin:10px 0 0;font-size:12px;color:#a1a1aa;">
                      Scan this at the gym entrance
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px;" />

              <!-- Magic link section -->
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#18181b;">
                Optional: set up your account
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6;">
                Your Stren account email is <strong>${accountEmail}</strong>.
                No temporary password is sent by email. Use this secure one-time
                link to sign in, then choose a password or skip that step for now.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#18181b;">
                    <a
                      href="${setupLink}"
                      style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;"
                    >
                      Log in to Stren →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                This email was sent by staff at ${gymName} when creating your
                membership. If you believe this was sent in error, do not use
                the sign-in link and contact the gym directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Plain-text fallback
// ---------------------------------------------------------------------------

function buildEmailText(params: {
  memberName: string
  gymName: string
  accountEmail: string
  qrPayload: string
  setupLink: string
}): string {
  const { memberName, gymName, accountEmail, qrPayload, setupLink } = params
  return [
    `Welcome to ${gymName}, ${memberName}!`,
    ``,
    `Your membership is active. Show your QR code at the kiosk to check in.`,
    `QR data: ${qrPayload}`,
    ``,
    `Your Stren account email is ${accountEmail}.`,
    `No temporary password is sent by email. Use this secure one-time link to sign in, then choose a password or skip that step for now:`,
    setupLink,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendOnboardingEmail(
  payload: OnboardingEmailPayload,
): Promise<SendResult> {
  const { to, memberName, gymName, qrPayload, setupLink } = payload

  // Use CID attachment since many email clients block data URI images.
  const qrCid = "member-qr@stren.app"
  const qrPngBase64 = await generateQrBase64Png(qrPayload)

  const html = buildEmailHtml({ memberName, gymName, accountEmail: to, qrCid, setupLink })
  const text = buildEmailText({ memberName, gymName, accountEmail: to, qrPayload, setupLink })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  let res: Response
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getResendKey()}`,
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [to],
        subject: `Your ${gymName} membership is ready`,
        html,
        text,
        attachments: [
          {
            filename: "membership-qr.png",
            content: qrPngBase64,
            contentId: qrCid,
            contentType: "image/png",
            disposition: "inline",
          },
        ],
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Resend request timed out." }
    }
    return { ok: false, error: error instanceof Error ? error.message : "Email send failed." }
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    let message = `Resend error ${res.status}`
    try {
      const body = await res.json() as { message?: string }
      if (body.message) message = body.message
    } catch {
      // ignore parse error
    }
    return { ok: false, error: message }
  }

  const data = (await res.json()) as { id?: string }
  return { ok: true, messageId: data.id ?? "unknown" }
}

export async function sendStaffInvitationEmail(
  payload: StaffInvitationEmailPayload,
): Promise<SendResult> {
  const safeName = escapeHtml(payload.teammateName)
  const safeGym = escapeHtml(payload.gymName)
  const safeLink = escapeHtml(payload.setupLink)
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18181b;background:#f4f4f5;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px"><h1 style="font-size:24px;margin:0 0 12px">You’ve been added to ${safeGym}</h1><p style="line-height:1.6;color:#52525b">Hi ${safeName}, use the secure one-time button below to open Stren and finish setting up your account.</p><p style="margin:24px 0"><a href="${safeLink}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open Stren</a></p><p style="font-size:12px;color:#71717a">If you were not expecting this invitation, do not use the link and contact the gym owner.</p></div></body></html>`
  const text = [
    `You’ve been added to ${payload.gymName}`,
    '',
    `Hi ${payload.teammateName}, use this secure one-time link to finish setting up your Stren account:`,
    payload.setupLink,
    '',
    'If you were not expecting this invitation, do not use the link and contact the gym owner.',
  ].join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getResendKey()}` },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [payload.to],
        subject: `Your ${payload.gymName} team access is ready`,
        html,
        text,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, error: `Resend error ${response.status}` }
    const data = await response.json() as { id?: string }
    return { ok: true, messageId: data.id || 'unknown' }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Resend request timed out.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Email send failed.' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<SendResult> {
  const safeLink = escapeHtml(payload.resetLink)
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18181b;background:#f4f4f5;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px"><h1 style="font-size:24px;margin:0 0 12px">Reset your Stren password</h1><p style="line-height:1.6;color:#52525b">Open the secure confirmation page below, then choose a new password. The link works once.</p><p style="margin:24px 0"><a href="${safeLink}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Continue password reset</a></p><p style="font-size:12px;color:#71717a">If you did not request this, you can safely ignore this email.</p></div></body></html>`
  const text = [
    "Reset your Stren password",
    "",
    "Open the secure confirmation page below, then choose a new password. The link works once.",
    payload.resetLink,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getResendKey()}` },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [payload.to],
        subject: "Reset your Stren password",
        html,
        text,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      let message = `Resend error ${response.status}`
      try {
        const body = await response.json() as { message?: string }
        if (body.message) message = body.message
      } catch {}
      return { ok: false, error: message }
    }
    const data = await response.json() as { id?: string }
    return { ok: true, messageId: data.id || "unknown" }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "Resend request timed out." }
    return { ok: false, error: error instanceof Error ? error.message : "Email send failed." }
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendOwnerInquiryEmail(payload: OwnerInquiryEmailPayload): Promise<SendResult> {
  const to = process.env.OWNER_INQUIRY_TO_EMAIL?.trim() || "bonakainu@gmail.com"
  const fields = [
    ["Gym", payload.gymName],
    ["Owner / manager", payload.contactName],
    ["Location", payload.location],
    ["Email", payload.email],
    ["Mobile", payload.mobile],
    ["Approximate members", payload.memberCount?.toString() || "Not provided"],
    ["How can we help?", payload.message || "Not provided"],
  ] as const
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a"><h1>New Stren gym inquiry</h1>${fields.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(value)}</p>`).join("")}</body></html>`
  const text = ["New Stren gym inquiry", "", ...fields.map(([label, value]) => `${label}: ${value}`)].join("\n")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getResendKey()}` },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [to],
        reply_to: payload.email,
        subject: `Gym inquiry: ${payload.gymName}`,
        html,
        text,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, error: `Resend error ${response.status}` }
    const data = await response.json() as { id?: string }
    return { ok: true, messageId: data.id || "unknown" }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "Resend request timed out." }
    return { ok: false, error: error instanceof Error ? error.message : "Email send failed." }
  } finally {
    clearTimeout(timeout)
  }
}
