import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/toaster';
import { TrialCta } from '@/components/trial-cta';
import { WebsiteContentHydrator } from '@/components/website-content-hydrator';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

const siteUrl = 'https://agenthubai.vercel.app';
const siteName = 'AgentHub AI';
const siteDescription =
  'AI business automation for WhatsApp, Instagram, Facebook Messenger and website chat. Capture leads, answer customers, book appointments and automate follow-ups 24/7 for businesses in Pakistan and worldwide.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'AgentHub AI | AI Business Automation for Pakistan & Worldwide', template: '%s | AgentHub AI' },
  description: siteDescription,
  applicationName: siteName,
  generator: 'Next.js',
  verification: {
    google: 'OGikM_zAaECLMGL5rnTB-vfs0OuSPjJRdJsVdwFBRqI',
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  icons: { icon: '/agenthub-logo.svg', shortcut: '/agenthub-logo.svg', apple: '/agenthub-logo.svg' },
  openGraph: { type: 'website', url: siteUrl, siteName, title: 'AgentHub AI | AI Business Automation for Pakistan & Worldwide', description: siteDescription, locale: 'en_PK', images: [{ url: '/landing-hero.svg', width: 1200, height: 630, alt: 'AgentHub AI business automation for WhatsApp, Instagram, Facebook and website chat' }] },
  twitter: { card: 'summary_large_image', title: 'AgentHub AI | AI Business Automation for Pakistan & Worldwide', description: siteDescription, images: ['/landing-hero.svg'] },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: `${siteUrl}/agenthub-logo.svg`,
      areaServed: [
        { '@type': 'Country', name: 'Pakistan' },
        { '@type': 'City', name: 'Islamabad' },
        { '@type': 'City', name: 'Lahore' },
        { '@type': 'City', name: 'Karachi' },
      ],
      knowsAbout: [
        'WhatsApp business automation',
        'AI customer support',
        'AI sales automation',
        'Lead follow-up automation',
        'AI appointment booking',
        'AI voice agents',
      ],
    },
    { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: siteName, url: siteUrl, inLanguage: 'en-PK', publisher: { '@id': `${siteUrl}/#organization` } },
    { '@type': 'SoftwareApplication', '@id': `${siteUrl}/#software`, name: siteName, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: siteUrl, description: siteDescription, publisher: { '@id': `${siteUrl}/#organization` }, featureList: ['AI customer support', 'WhatsApp business automation', 'Instagram and Facebook Messenger automation', 'Website chat', 'Lead capture', 'Appointment booking', 'Automatic follow-ups', 'AI voice replies', 'Human takeover'] },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/landing-hero.svg?v=bright-agenthub-2" as="image" type="image/svg+xml" fetchPriority="high" />
      </head>
      <body className={inter.className}>
        <ThemeProvider><AuthProvider><WebsiteContentHydrator />{children}<TrialCta /><Toaster /></AuthProvider></ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
