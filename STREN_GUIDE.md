# Stren Gym ERP Platform

A comprehensive gym management system built with Next.js 16, React 19, and Tailwind CSS.

## Features Implemented

### Core Pages
- **Dashboard** - Overview with key metrics, attendance trends, peak hours, and recent activity
- **Members** - Full member management with search, filtering, and detailed profiles
- **Member Details** - Individual member attendance tracking, class enrollment, and history
- **Check-In/Out** - QR scanner interface with manual ID entry and real-time check-in tracking
- **Classes** - Class scheduling, management, and enrollment capacity tracking
- **Plans** - Membership plan management with revenue analytics
- **Staff** - Team management with role-based access control (Admin, Trainer, Staff)
- **Reports** - Comprehensive analytics with attendance trends, revenue reports, and member statistics
- **Settings** - Gym configuration, notifications, billing, and security settings

### Key Features

#### Authentication & Authorization
- Mock authentication system (works with any email/password)
- Session-based user management via localStorage
- Role-based access control (Admin, Staff, Trainer)
- Protected dashboard routes

#### Member Management
- Add/edit/delete members
- Search and filter by status
- View individual member profiles with:
  - Attendance history
  - Class enrollment
  - Check-in/out history
  - Attendance trends and statistics

#### Check-In System
- QR code scanner interface (camera-based)
- Manual member ID entry
- Real-time check-in/out tracking
- Daily statistics and peak hour analysis

#### Analytics & Reporting
- Attendance trends (line charts)
- Revenue vs target (bar charts)
- Member distribution by plan (pie charts)
- Peak hours analysis
- Member status breakdown
- Exportable reports

#### Membership Plans
- Create and manage pricing tiers
- Track members per plan
- Revenue calculation by plan
- Plan analytics

#### Staff Management
- Add team members with roles
- Permission management
- Department assignment
- Staff status tracking
- Active session management

## Design

### Color Scheme
- **Primary**: Tan (#C4A574) - From Stren logo
- **Secondary**: Charcoal (#3A3A3A) - From Stren logo
- **Background**: Clean white/light gray
- **Text**: Dark charcoal on light backgrounds
- **Accents**: Green (success), Red (alerts), Blue (info)

### Typography
- Sans-serif (Geist) for body and headings
- Mono (Geist Mono) for code/technical elements
- Clear hierarchy with bold headings

### Layout
- Mobile-first responsive design
- Desktop sidebar navigation
- Mobile hamburger menu
- Grid-based layout system
- Flexbox for component alignment

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui
- **Charts**: Recharts
- **Icons**: Lucide React
- **Form Management**: React Hook Form
- **Validation**: Zod
- **State Management**: React hooks + localStorage

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (or npm/yarn)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Run the development server:
```bash
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000)

### Demo Login
- Email: `demo@stren.com` (any email works)
- Password: `password` (any password works)

## Project Structure

```
app/
├── page.tsx                 # Login page
├── globals.css             # Design tokens and styles
├── layout.tsx              # Root layout
└── dashboard/
    ├── layout.tsx          # Dashboard layout with nav
    ├── page.tsx            # Dashboard home
    ├── members/
    │   ├── page.tsx        # Members list
    │   └── [id]/page.tsx   # Member details
    ├── checkin/
    │   └── page.tsx        # QR check-in interface
    ├── classes/
    │   └── page.tsx        # Class scheduling
    ├── plans/
    │   └── page.tsx        # Membership plans
    ├── staff/
    │   └── page.tsx        # Staff management
    ├── reports/
    │   └── page.tsx        # Analytics & reports
    └── settings/
        └── page.tsx        # Configuration

public/
└── stren-logo.png         # Brand logo
```

## API Routes (Future)

The app currently uses mock data. To connect to a real backend:

1. Replace `localStorage` with API calls
2. Create `/app/api/` routes for:
   - `/auth/login` - Authentication
   - `/members` - Member CRUD
   - `/checkin` - Check-in/out
   - `/classes` - Class management
   - `/reports` - Analytics data
   - `/staff` - Staff management

## Customization

### Changing Colors
Edit `/app/globals.css` and update the CSS custom properties:
```css
--primary: oklch(...); /* Main brand color */
--secondary: oklch(...); /* Secondary color */
```

### Adding New Pages
1. Create new folder in `/app/dashboard/`
2. Add `page.tsx` component
3. Update navigation in `/app/dashboard/layout.tsx`

### Modifying Mock Data
Each page contains mock data in arrays. Replace with API calls as needed.

## Features Ready for Integration

- Database integration (Supabase, Neon, etc.)
- Real payment processing
- Email notifications
- SMS alerts
- Calendar sync
- Mobile app
- Advanced reporting exports
- Custom branding

## Performance

- Server-side rendering for SEO
- Client-side rendering for interactivity
- Optimized images with Next.js Image
- Recharts for efficient charting
- Tailwind CSS for minimal CSS output

## Accessibility

- Semantic HTML elements
- ARIA labels and roles
- Keyboard navigation support
- Color contrast compliance
- Screen reader friendly

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## License

Proprietary - Stren Gym Management

## Support

For issues or questions, contact support@stren.com
