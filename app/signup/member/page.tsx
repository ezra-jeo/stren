'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { memberSignUpSchema } from '@/lib/validations';
import type { z } from 'zod';

type MemberSignUpFormData = z.infer<typeof memberSignUpSchema>;

export default function MemberSignUpPage() {
  return (
    <Suspense fallback={<MemberSignupFallback />}>
      <MemberSignUpPageContent />
    </Suspense>
  );
}

function MemberSignupFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <p style={{ color: 'var(--color-text-secondary)' }}>Loading signup...</p>
    </div>
  );
}

function MemberSignUpPageContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<'gym' | 'details' | 'done'>('gym');
  const [gymQuery, setGymQuery] = useState('');
  const [gyms, setGyms] = useState<{ id: string; name: string; code: string; address: string | null }[]>([]);
  const [selectedGym, setSelectedGym] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MemberSignUpFormData>({
    resolver: zodResolver(memberSignUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefillAttemptedRef = useRef(false);

  async function fallbackSearchGyms(query: string) {
    const trimmed = query.trim();
    const { data, error } = await supabase
      .from('gyms')
      .select('id, name, code, address')
      .or(`name.ilike.%${trimmed}%,code.ilike.%${trimmed}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Gym fallback search error:', error.message);
      return [];
    }

    return data ?? [];
  }

  async function fallbackGetGymByCode(code: string) {
    const { data, error } = await supabase
      .from('gyms')
      .select('id, name, code')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      console.error('Gym fallback by-code error:', error.message);
      return null;
    }

    return data;
  }

  useEffect(() => {
    if (prefillAttemptedRef.current) return;
    prefillAttemptedRef.current = true;

    const gymCodeParam = searchParams.get('gym');
    if (!gymCodeParam) return;
    const gymCode = gymCodeParam;

    let isCancelled = false;

    async function prefillGym() {
      const { data, error } = await supabase.rpc('get_gym_by_code', { p_code: gymCode });
      if (isCancelled) return;

      if (data && data.is_published) {
        setSelectedGym({ id: data.id, name: data.name });
        setStep('details');
        return;
      }

      if (error || !data) {
        const fallbackGym = await fallbackGetGymByCode(gymCode);
        if (isCancelled || !fallbackGym) return;

        setSelectedGym({ id: fallbackGym.id, name: fallbackGym.name });
        setStep('details');
      }
    }

    prefillGym();

    return () => {
      isCancelled = true;
    };
  }, [searchParams, supabase]);

  function handleGymQueryChange(query: string) {
    setGymQuery(query);
    setGyms([]);
    if (query.length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc('search_gyms', { p_query: query });

      if (error) {
        console.error('Gym search error:', error.message);
        const fallbackGyms = await fallbackSearchGyms(query);
        setGyms(fallbackGyms);
        setSearching(false);
        return;
      }

      if (!data || data.length === 0) {
        const fallbackGyms = await fallbackSearchGyms(query);
        setGyms(fallbackGyms);
        setSearching(false);
        return;
      }

      setGyms(data ?? []);
      setSearching(false);
    }, 300);
  }

  const onSubmit = async (data: MemberSignUpFormData) => {
    setError('');
    if (!selectedGym) {
      setError('Please select a gym first');
      return;
    }

    setIsLoading(true);

    const { name, email, password } = data;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'member' } },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }
    if (!authData.user) {
      setError('Sign-up failed');
      setIsLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(`Account created but could not sign in: ${signInError.message}`);
      setIsLoading(false);
      return;
    }

    const qrCode = `stren://checkin/${selectedGym.id}/${authData.user.id}`;
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        { id: authData.user.id, email, name, role: 'member' as const, status: 'active' as const, gym_id: selectedGym.id, qr_code: qrCode },
        { onConflict: 'id' },
      );

    if (profileError) {
      setError(profileError.message);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    router.replace('/member');
  };

  const inputStyle = {
    backgroundColor: 'hsl(var(--white))',
    borderColor: 'hsl(var(--light-gray))',
    borderWidth: '1.5px' as const,
    color: 'hsl(var(--text-primary))',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-12">
          <Link href="/landing">
            <div className="cursor-pointer hover:opacity-80 transition-opacity">
              <Image src="/stren-logo.png" alt="Stren Logo" width={80} height={80} className="object-contain" />
            </div>
          </Link>
        </div>

        <div className="p-8 rounded-lg border shadow-md" style={{ backgroundColor: 'hsl(var(--white))', borderColor: 'hsl(var(--surface))', borderWidth: '1px' }}>
          <Link href="/signup" className="inline-flex items-center gap-1 mb-6 text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          {step === 'done' ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: 'hsl(var(--primary))' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--text-primary))', fontFamily: 'var(--font-heading)' }}>
                Account Created!
              </h2>
              <p className="text-base mb-6" style={{ color: 'hsl(var(--text-secondary))' }}>
                Your account for <strong>{selectedGym?.name}</strong> is ready. You can now log in.
              </p>
              <Link href="/login" className="inline-block py-3 px-8 rounded-lg font-semibold" style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-dark)))', color: 'hsl(var(--white))' }}>
                Go to Login
              </Link>
            </div>
          ) : step === 'gym' ? (
            <>
              <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                Find Your Gym
              </h1>
              <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                Search by gym name or code
              </p>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--text-muted))' }} />
                <input
                  type="text"
                  placeholder="e.g. Iron Paradise or GYM-ABC"
                  value={gymQuery}
                  onChange={(e) => handleGymQueryChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border focus:outline-none"
                  style={inputStyle}
                />
              </div>
              {searching && <p className="text-sm mb-2" style={{ color: 'hsl(var(--text-muted))' }}>Searching...</p>}
              {gyms.length > 0 && (
                <div className="space-y-2 mb-6">
                  {gyms.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedGym({ id: g.id, name: g.name });
                        setStep('details');
                      }}
                      className="w-full text-left p-4 rounded-lg border transition-all"
                      style={{ borderColor: 'hsl(var(--light-gray))', borderWidth: '1.5px' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'hsl(var(--primary))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'hsl(var(--light-gray))';
                      }}
                    >
                      <p className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>{g.name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--text-muted))' }}>
                        Code: {g.code}
                        {g.address ? ` · ${g.address}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {gymQuery.length >= 2 && gyms.length === 0 && !searching && (
                <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--text-muted))' }}>
                  No gyms found. Ask your gym to register on Stren.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                Create Account
              </h1>
              <p className="text-sm mb-6" style={{ color: 'hsl(var(--text-secondary))' }}>
                Joining <strong>{selectedGym?.name}</strong>{' '}
                <button onClick={() => setStep('gym')} className="underline" style={{ color: 'hsl(var(--primary))' }}>change</button>
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--text-secondary))' }}>Full Name</label>
                  <input {...register('name')} type="text" placeholder="Juan Dela Cruz" disabled={isLoading} className="w-full px-4 py-3 rounded-lg border focus:outline-none" style={inputStyle} />
                  {errors.name && <p className="text-xs mt-1" style={{ color: 'hsl(var(--danger))' }}>{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--text-secondary))' }}>Email</label>
                  <input {...register('email')} type="email" placeholder="you@example.com" disabled={isLoading} className="w-full px-4 py-3 rounded-lg border focus:outline-none" style={inputStyle} />
                  {errors.email && <p className="text-xs mt-1" style={{ color: 'hsl(var(--danger))' }}>{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                  <input {...register('password')} type="password" placeholder="••••••••" disabled={isLoading} className="w-full px-4 py-3 rounded-lg border focus:outline-none" style={inputStyle} />
                  {errors.password && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.password.message}</p>}
                </div>
                {error && <p className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
                <button type="submit" disabled={isLoading} className="w-full py-3 rounded-lg font-semibold uppercase tracking-widest transition-all hover:scale-105 active:scale-100" style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)', color: 'var(--color-white)', boxShadow: '0 4px 14px rgba(212,149,106,0.4)' }}>
                  {isLoading ? 'Creating...' : 'Create Account'}
                </button>
              </form>
            </>
          )}

          <div className="mt-8 text-center">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Already have an account?{' '}
              <Link href="/login" className="font-semibold" style={{ color: 'var(--color-primary)' }}>Sign in</Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>Stren © 2026. All rights reserved.</p>
      </div>
    </div>
  );
}
