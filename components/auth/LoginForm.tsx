'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@/lib/validations';
import type { z } from 'zod';
import { isValidLoginOrigin } from '@/lib/login-origin'
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

function getRoleHome(role: string): string {
  switch (role) {
    case 'owner':
    case 'admin':
    case 'staff':
      return '/admin';
    case 'member':
    default:
      return '/member';
  }
}

interface LoginFormProps {
  gymCode?: string;
  initialOriginPath?: string;
}

type LoginFormData = z.infer<typeof loginSchema>;

const LOGIN_ORIGIN_STORAGE_KEY = 'stren.auth.loginOriginPath';

export function LoginForm({ gymCode, initialOriginPath }: LoginFormProps) {
  const router = useRouter();
  const { signIn, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const {
    handleSubmit,
    getValues,
    setValue,
    control,
  } = form;

  const resolveGymIdByCode = async (code: string): Promise<string | null> => {
    const { data, error: gymError } = await supabase
      .from('gyms')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (gymError) return null;
    return data?.id ?? null;
  };

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const { email, password } = data;

      const { error: authError, user, profile } = await signIn(email, password);

      if (authError) {
        setValue('password', '', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
        setError(authError);
        return;
      }

      if (!user) {
        setError('Login failed. Please try again.');
        return;
      }

      if (profile?.status === 'rejected') {
        setError('Your membership request was not approved. Contact the gym for details.');
        await signOut();
        return;
      }

      if (gymCode) {
        const targetGymId = await resolveGymIdByCode(gymCode);
        if (!targetGymId) {
          setError('Unable to verify gym. Please try again.');
          await signOut();
          return;
        }

        if (profile?.gymId !== targetGymId) {
          setError('This account is not part of this gym.');
          await signOut();
          return;
        }
      }

      if (typeof window !== 'undefined') {
        const computed = initialOriginPath
          ? initialOriginPath
          : gymCode
            ? `/gym/${encodeURIComponent(gymCode)}/login`
            : '/login'

        // Always persist a normalized (decoded) origin to avoid encoded '?' markers.
        let originPath = computed
        try {
          const decoded = decodeURIComponent(computed)
          originPath = decoded
        } catch {
          originPath = computed
        }

        originPath = isValidLoginOrigin(originPath) ? originPath : (gymCode ? `/gym/${encodeURIComponent(gymCode)}/login` : '/login')

        try {
          window.localStorage.removeItem(LOGIN_ORIGIN_STORAGE_KEY);
          window.localStorage.setItem(LOGIN_ORIGIN_STORAGE_KEY, originPath);
        } catch {
          // Storage can be unavailable in private/locked-down browser contexts.
        }
      }

      router.push(getRoleHome(profile?.role ?? 'admin'));
    } catch {
      setError('Login failed unexpectedly. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = getValues('email')?.trim();
    setError('');
    setMessage('');

    if (!email) {
      setError('Enter your email first, then tap Forgot password.');
      return;
    }

    setIsSendingReset(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      setError(resetError.message);
      setIsSendingReset(false);
      return;
    }

    setMessage('Password reset link sent. Check your email inbox.');
    setIsSendingReset(false);
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'hsl(var(--text-secondary))' }}
                >
                  Email
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    disabled={isLoading}
                    className="h-12 rounded-2xl border-[1.5px] bg-white"
                    style={{
                      backgroundColor: 'hsl(var(--white))',
                      borderColor: 'hsl(var(--surface))',
                      color: 'hsl(var(--text-primary))',
                    }}
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'hsl(var(--text-secondary))' }}
                >
                  Password
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="h-12 rounded-2xl border-[1.5px] bg-white"
                    style={{
                      backgroundColor: 'hsl(var(--white))',
                      borderColor: 'hsl(var(--surface))',
                      color: 'hsl(var(--text-primary))',
                    }}
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          {error && (
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--danger))' }}>
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--success))' }}>
              {message}
            </p>
          )}

          <div className="-mt-1 text-right">
            <button
              type="button"
              onClick={() => void handleForgotPassword()}
              disabled={isLoading || isSendingReset}
              className="text-xs font-medium underline"
              style={{ color: 'var(--color-primary, hsl(var(--primary)))' }}
            >
              {isSendingReset ? 'Sending reset link...' : 'Forgot password?'}
            </button>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-2xl font-semibold uppercase tracking-widest"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary, hsl(var(--primary))) 0%, var(--color-primary-dark, hsl(var(--primary-dark))) 100%)',
              color: 'var(--color-white, hsl(var(--white)))',
              boxShadow: '0 8px 20px var(--color-primary-glow, hsl(var(--primary-glow)))',
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Form>

      <div className="mt-8 text-center">
        <p style={{ color: 'hsl(var(--text-secondary))' }}>
          Don&apos;t have an account?{' '}
          <Link
            href={gymCode ? `/gym/${encodeURIComponent(gymCode)}/signup?from=login` : '/signup'}
            className="font-semibold transition-colors"
            style={{ color: 'hsl(var(--primary))' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </>
  );
}
