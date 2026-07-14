import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Stren',
  description: 'Gym Membership Tracking',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/stren-logo.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/stren-logo.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/stren-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  )
}
