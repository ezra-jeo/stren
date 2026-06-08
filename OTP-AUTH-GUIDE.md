# Member Phone OTP Flow Guide

This document explains how the phone OTP flow works in this project and how to fix the Unsupported phone provider error.

## What Was Changed

- Member signup now uses name plus phone plus OTP instead of email plus password.
- Login now has two tabs:
  - Member: phone OTP login
  - Admin or Staff: email plus password login
- OTP input UI is a reusable 6-digit component.

## Files Involved

- app/signup/member/page.tsx
- app/login/page.tsx
- components/ui/otp-input.tsx
- lib/validations.ts

## Phone Normalization Rule

Before sending OTP, the phone is validated and normalized to E.164 format.

Examples:
- 09171234567 becomes +639171234567
- 9171234567 becomes +639171234567
- 639171234567 becomes +639171234567

Validation currently expects Philippine mobile format in this pattern:
- +639 followed by 9 digits

## Member Signup Flow

### Step 1: Gym selection

User searches and selects a gym.

### Step 2: Details submission

Inputs:
- Full name
- Phone number

Process:
1. Validate using memberSignUpSchema.
2. Normalize phone to E.164.
3. Call Supabase auth signInWithOtp using the normalized phone.
4. Move to OTP step when SMS request is accepted.

### Step 3: OTP verification

Inputs:
- 6-digit OTP

Process:
1. Call Supabase auth verifyOtp with:
   - phone: normalized phone
   - token: OTP value
   - type: sms
2. Get user id from verified auth session.
3. Upsert profiles row with:
   - id
   - name
   - phone
   - role member
   - status pending
   - gym_id
   - qr_code
4. Sign out immediately.
5. Show done step (awaiting admin approval).

Why sign out after signup:
- Newly created members should not enter the app until gym admin approves.

## Member Login Flow

### Step 1: Send OTP

1. Validate and normalize phone via memberLoginSchema.
2. Call signInWithOtp.
3. Move to OTP step.

### Step 2: Verify OTP

1. Call verifyOtp with type sms.
2. Fetch profiles role and status for the user id.
3. If status is pending: show awaiting approval and sign out.
4. If status is rejected: show rejection and sign out.
5. Otherwise route user by role:
   - owner, admin, staff to /admin
   - member to /member

## Admin Login Flow

Admin and staff login is unchanged:
- Uses email plus password
- Still checks profile status pending or rejected
- Routes by role

## Resend Timer Behavior

For both signup OTP and login OTP:
- Countdown starts at 30 seconds when OTP step opens.
- Resend is disabled while timer is above 0.
- Resend resets timer to 30 and clears OTP input.

## Why You See Unsupported Phone Provider

This error comes from Supabase Auth configuration, not from page UI logic.

It means your project can call phone OTP methods, but no valid SMS provider is enabled or configured for phone auth.

## Fix Checklist For Unsupported Phone Provider

1. Open Supabase Dashboard for the same project your app is using.
2. Go to Authentication, then Providers, then Phone.
3. Enable Phone provider.
4. Configure an SMS backend in that section.
   - Example provider options depend on your Supabase version and plan.
   - Complete all required credentials and save.
5. If your provider requires sender setup, configure sender id or approved from number.
6. If using test mode, add test phone numbers in Supabase Auth settings.
7. Confirm your app environment points to the same Supabase project:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
8. Restart dev server after changing environment values.
9. Retry OTP send using a fully normalized phone such as +639171234567.

## Quick Runtime Verification

After provider setup:

1. Signup page:
   - Enter name and phone
   - Send code
   - Verify code
   - Confirm done message says awaiting approval
2. Database:
   - profiles row exists with status pending and phone filled
3. Login page member tab:
   - Send and verify OTP
   - Confirm pending users are blocked with approval message

## Database Notes

- Run 011_security_hardening.sql before deployment.
- Keep profiles phone nullable for existing admins or legacy rows.
- Member phone requirement is enforced in application layer and OTP flow.

## Common Pitfalls

- Wrong Supabase project keys in local env
- Phone provider not enabled in Auth settings
- Provider enabled but missing required credentials
- Entering local phone format when backend expects E.164
- Verifying OTP for a different phone than the one used for send
