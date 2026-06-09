'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { memberSignUpSchema } from '@/lib/validations';
import { createClient } from '@/lib/supabase';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type FormData = z.infer<typeof memberSignUpSchema>;

interface GymSignUpFormProps {
  gymCode: string;
  gymId: string;
}

export function GymSignUpForm({ gymCode, gymId }: GymSignUpFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [serverError, setServerError] = useState('');

  const form = useForm<FormData>({
    resolver: zodResolver(memberSignUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (data: FormData) => {
    setServerError('');

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name, role: 'member' } },
    });
    if (authError) {
      setServerError(authError.message);
      return;
    }
    if (!authData.user) {
      setServerError('Sign-up failed. Please try again.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signInError) {
      setServerError(`Account created but could not sign in: ${signInError.message}`);
      return;
    }

    const qrCode = `stren://checkin/${gymId}/${authData.user.id}`;
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: authData.user.id,
        email: data.email,
        name: data.name,
        role: 'member' as const,
        status: 'active' as const,
        gym_id: gymId,
        qr_code: qrCode,
      },
      { onConflict: 'id' },
    );
    if (profileError) {
      setServerError(profileError.message);
      return;
    }

    router.replace('/member');
    router.refresh();
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" data-gym-code={gymCode}>
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--text-secondary))' }}>
                Full Name
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="Juan Dela Cruz"
                  disabled={isSubmitting}
                  className="h-12 rounded-lg border-[1.5px]"
                  style={{
                    backgroundColor: 'hsl(var(--white))',
                    borderColor: 'hsl(var(--light-gray))',
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
          name="email"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--text-secondary))' }}>
                Email
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                  className="h-12 rounded-lg border-[1.5px]"
                  style={{
                    backgroundColor: 'hsl(var(--white))',
                    borderColor: 'hsl(var(--light-gray))',
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
            <FormItem className="space-y-2">
              <FormLabel className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(var(--text-secondary))' }}>
                Password
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  placeholder="********"
                  disabled={isSubmitting}
                  className="h-12 rounded-lg border-[1.5px]"
                  style={{
                    backgroundColor: 'hsl(var(--white))',
                    borderColor: 'hsl(var(--light-gray))',
                    color: 'hsl(var(--text-primary))',
                  }}
                />
              </FormControl>
              <p className="text-xs" style={{ color: 'hsl(var(--text-muted))' }}>
                Must be at least 6 characters
              </p>
              <FormMessage className="text-xs mt-1" />
            </FormItem>
          )}
        />

        {serverError && (
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--danger))' }}>
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 rounded-lg font-semibold uppercase tracking-widest"
        >
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>
    </Form>
  );
}
