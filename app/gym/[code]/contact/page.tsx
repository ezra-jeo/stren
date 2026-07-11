import { notFound } from 'next/navigation';
import { getGymPublicByCode } from '@/lib/gym-public';
import { toGymPreviewData } from '@/lib/gym-data';
import { GymLandingPreview } from '@/components/gym/GymLandingPreview';

type PageProps = { params: Promise<{ code: string }> | { code: string } };

export const revalidate = 86400;

export default async function ContactPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const { data } = await getGymPublicByCode(rawCode);
  if (!data || !data.is_published) notFound();

  const preview = toGymPreviewData(data as Record<string, unknown>);

  return <GymLandingPreview gym={preview} view="contact" interactive />;
}
