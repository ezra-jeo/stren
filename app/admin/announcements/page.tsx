'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { A, ACard, EmptyState, GhostBtn, LoadingSkeleton, PageHeader, PrimaryBtn } from '@/lib/admin-ui';
import { toast } from 'sonner';
import { Plus, Megaphone, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { announcementSchema } from '@/lib/validations';
import type { z } from 'zod';

interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

type AnnouncementFormData = z.infer<typeof announcementSchema>;

export default function AdminAnnouncementsPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: '',
      body: '',
    },
  });

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  async function loadAnnouncements() {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setAnnouncements(
        data.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          createdAt: a.created_at ?? new Date().toISOString(),
        })),
      );
    }
    setIsLoading(false);
  }

  const onSubmit = async (data: AnnouncementFormData) => {
    if (!profile) return;

    const { error } = await supabase.from('announcements').insert({
      title: data.title,
      body: data.body,
      created_by: profile.id,
    });

    if (error) {
      toast.error('Failed to create announcement');
      return;
    }

    await supabase.from('feed_items').insert({
      member_id: profile.id,
      type: 'announcement' as const,
      title: `${data.title}`,
      description: data.body,
    });

    toast.success('Announcement posted!');
    setShowForm(false);
    reset();
    await loadAnnouncements();
  };

  async function deleteAnnouncement(id: string) {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    toast.success('Announcement deleted');
    await loadAnnouncements();
  }

  if (isLoading) {
    return <LoadingSkeleton rows={4} h={76} />;
  }

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Announcements"
        subtitle="Broadcast messages to all members"
        action={
          <PrimaryBtn onClick={() => setShowForm(!showForm)}>
            <Plus size={16} />
            New Announcement
          </PrimaryBtn>
        }
      />

      {showForm && (
        <ACard className="p-4">
          <p className="text-base font-semibold mb-4" style={{ color: A.text }}>Create Announcement</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm" style={{ color: A.text2 }}>Title</label>
              <input
                {...register('title')}
                placeholder="e.g. Holiday Hours"
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
              />
              {errors.title && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.title.message}</p>}
            </div>
            <div>
              <label className="text-sm" style={{ color: A.text2 }}>Message</label>
              <textarea
                {...register('body')}
                placeholder="Write your announcement..."
                rows={4}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
              />
              {errors.body && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.body.message}</p>}
            </div>
            <div className="flex gap-2">
              <PrimaryBtn type="submit" disabled={isSubmitting}>{isSubmitting ? 'Posting...' : 'Post Announcement'}</PrimaryBtn>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text2 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </ACard>
      )}

      {announcements.length === 0 ? (
        <EmptyState icon={<Megaphone size={40} />} title="No announcements yet" subtitle="Post a message to notify all members." />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <ACard key={a.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium" style={{ color: A.text }}>{a.title}</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: A.text2 }}>{a.body}</p>
                  <p className="text-xs" style={{ color: A.muted }}>
                    {new Date(a.createdAt).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <GhostBtn onClick={() => deleteAnnouncement(a.id)} color={A.danger}>
                  <Trash2 size={16} />
                </GhostBtn>
              </div>
            </ACard>
          ))}
        </div>
      )}
    </div>
  );
}
