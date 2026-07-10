import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GymTopNav } from '@/components/gym/GymTopNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/gym/grove' }));

describe('GymTopNav — public feature gating (§8.5)', () => {
  it('shows Pricing and Locate Us by default', () => {
    render(<GymTopNav gymName="Grove" gymCode="grove" isPublished />);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Locate Us')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('drops Pricing and Locate Us when their features are off', () => {
    render(<GymTopNav gymName="Grove" gymCode="grove" isPublished features={{ public_pricing: false, public_location: false }} />);
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
    expect(screen.queryByText('Locate Us')).not.toBeInTheDocument();
    // Contact (ungated) stays.
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('renders nothing when the gym is unpublished', () => {
    const { container } = render(<GymTopNav gymName="Grove" gymCode="grove" isPublished={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
