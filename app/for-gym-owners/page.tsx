'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type InquiryForm = {
  gymName: string;
  contactName: string;
  location: string;
  email: string;
  mobile: string;
  memberCount: string;
  message: string;
};

const initialForm: InquiryForm = {
  gymName: '',
  contactName: '',
  location: '',
  email: '',
  mobile: '',
  memberCount: '',
  message: '',
};

export default function OwnerInquiryPage() {
  const [form, setForm] = useState(initialForm);
  const [hydrated, setHydrated] = useState(false);
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setHydrated(true), []);

  function update<K extends keyof InquiryForm>(key: K, value: InquiryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/owner-inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          memberCount: form.memberCount ? Number(form.memberCount) : undefined,
          company,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'We could not send your inquiry. Please try again.');
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not send your inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-(--color-background) px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link href="/landing" className="inline-flex items-center gap-2 text-sm font-semibold text-(--color-text-primary)">
          <Image src="/stren-logo.png" alt="" width={28} height={28} />
          Stren
        </Link>

        <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-(--color-surface) bg-(--color-white) shadow-[0_24px_70px_rgba(53,39,31,0.10)] md:grid md:grid-cols-[0.82fr_1.18fr]">
          <section className="relative overflow-hidden bg-[linear-gradient(145deg,#fff7f1,#fce8da)] p-8 sm:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-(--color-primary-dark)">Personal setup assistance</p>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight text-(--color-text-primary) sm:text-5xl">
              Bring Stren to your gym
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-(--color-text-secondary)">
              Tell us about your gym. Our team will help you set up your workspace, member records, and staff access.
            </p>
            <div className="mt-10 rounded-2xl border border-white/70 bg-white/55 p-5 text-sm leading-6 text-(--color-text-secondary)">
              We personally assist with setup so your gym is configured correctly from the start.
            </div>
          </section>

          <section className="p-6 sm:p-10 md:p-12">
            {sent ? (
              <div role="status" className="flex min-h-[28rem] flex-col justify-center">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-(--color-primary-dark)">Inquiry received</p>
                <h2 className="mt-3 font-serif text-3xl font-semibold text-(--color-text-primary)">Thanks for telling us about your gym.</h2>
                <p className="mt-4 max-w-lg leading-7 text-(--color-text-secondary)">
                  We’ll be in touch to learn what you need and guide the setup personally.
                </p>
                <Link href="/landing" className="mt-8 font-semibold text-(--color-primary-dark)">Back to Stren</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-5" aria-busy={submitting}>
                <div>
                  <h2 className="font-serif text-3xl font-semibold text-(--color-text-primary)">Tell us about your gym</h2>
                  <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">A real person from Stren will follow up with you.</p>
                </div>

                <OwnerField label="Gym name" id="owner-gym-name" value={form.gymName} onChange={(value) => update('gymName', value)} required disabled={!hydrated || submitting} />
                <OwnerField label="Owner or manager name" id="owner-contact-name" value={form.contactName} onChange={(value) => update('contactName', value)} autoComplete="name" required disabled={!hydrated || submitting} />
                <OwnerField label="Location" id="owner-location" value={form.location} onChange={(value) => update('location', value)} autoComplete="street-address" required disabled={!hydrated || submitting} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <OwnerField label="Email address" id="owner-email" type="email" value={form.email} onChange={(value) => update('email', value)} autoComplete="email" required disabled={!hydrated || submitting} />
                  <OwnerField label="Mobile number" id="owner-mobile" type="tel" value={form.mobile} onChange={(value) => update('mobile', value)} autoComplete="tel" required disabled={!hydrated || submitting} />
                </div>
                <OwnerField label="Approximate number of members (optional)" id="owner-members" type="number" value={form.memberCount} onChange={(value) => update('memberCount', value)} min="0" disabled={!hydrated || submitting} />
                <label className="grid gap-2 text-sm font-semibold text-(--color-text-primary)" htmlFor="owner-message">
                  How can we help? (optional)
                  <textarea
                    id="owner-message"
                    rows={4}
                    value={form.message}
                    onChange={(event) => update('message', event.target.value)}
                    disabled={!hydrated || submitting}
                    className="resize-y rounded-xl border border-(--color-surface) bg-white px-4 py-3 font-normal outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
                  />
                </label>
                <div className="absolute -left-[10000px]" aria-hidden="true">
                  <label htmlFor="owner-company">Company website</label>
                  <input id="owner-company" tabIndex={-1} autoComplete="off" value={company} onChange={(event) => setCompany(event.target.value)} />
                </div>

                {error && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-sm text-(--color-text-primary)">{error}</p>}
                <button
                  type="submit"
                  disabled={!hydrated || submitting}
                  className="min-h-13 rounded-xl bg-(--color-primary) px-5 font-bold text-white transition-colors hover:bg-(--color-primary-dark) disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting ? 'Sending…' : 'Talk to our team'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function OwnerField({
  label,
  id,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
  disabled,
  min,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  disabled: boolean;
  min?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-(--color-text-primary)" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        min={min}
        className="min-h-12 rounded-xl border border-(--color-surface) bg-white px-4 font-normal outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
      />
    </label>
  );
}
