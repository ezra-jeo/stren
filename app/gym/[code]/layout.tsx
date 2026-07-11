import { notFound } from 'next/navigation';
import { brandColorVars } from '@/lib/brand-color';
import { getGymPublicByCode } from '@/lib/gym-public';
import { GymTopNav } from '@/components/gym/GymTopNav';
import { GymPoweredBy } from '@/components/gym/GymPoweredBy';

export const revalidate = 86400;

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ code: string }> | { code: string };
};

type GymLayoutData = {
  name: string;
  code: string;
  brand_color: string | null;
  secondary_color?: string | null;
  is_published: boolean;
  features?: {
    public_pricing?: boolean;
    public_location?: boolean;
  };
};

export default async function GymLayout({ children, params }: LayoutProps) {
  const { code: rawCode } = await params;
  const { data } = await getGymPublicByCode(rawCode);
  const gymData = data as GymLayoutData | null;
  const isPublished = !!gymData?.is_published;

  if (!gymData) notFound();

  return (
    <>
      <style>{`:root { ${brandColorVars(gymData.brand_color ?? '#D4956A', gymData.secondary_color ?? null)} }`}</style>

      <GymTopNav
        gymName={gymData.name}
        gymCode={gymData.code}
        isPublished={isPublished}
        features={gymData.features}
      />

      <main>{children}</main>

      <GymPoweredBy gymCode={gymData.code} />
    </>
  );
}
