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
  'AI business automation for WhatsApp, Instagram, Facebook Messenger and website chat. Capture leads, answer customers, book appointments and automate follow-ups 24/7.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'AgentHub AI | AI Business Automation & Customer Support', template: '%s | AgentHub AI' },
  description: siteDescription,
  applicationName: siteName,
  generator: 'Next.js',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  icons: { icon: '/agenthub-logo.svg', shortcut: '/agenthub-logo.svg', apple: '/agenthub-logo.svg' },
  openGraph: { type: 'website', url: siteUrl, siteName, title: 'AgentHub AI | AI Business Automation & Customer Support', description: siteDescription, locale: 'en_US', images: [{ url: '/landing-hero.svg', width: 1200, height: 630, alt: 'AgentHub AI business automation' }] },
  twitter: { card: 'summary_large_image', title: 'AgentHub AI | AI Business Automation & Customer Support', description: siteDescription, images: ['/landing-hero.svg'] },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: siteName, url: siteUrl, logo: `${siteUrl}/agenthub-logo.svg` },
    { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: siteName, url: siteUrl, publisher: { '@id': `${siteUrl}/#organization` } },
    { '@type': 'SoftwareApplication', '@id': `${siteUrl}/#software`, name: siteName, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: siteUrl, description: siteDescription, publisher: { '@id': `${siteUrl}/#organization` }, featureList: ['AI customer support', 'WhatsApp business automation', 'Instagram and Facebook Messenger automation', 'Website chat', 'Lead capture', 'Appointment booking', 'Automatic follow-ups', 'AI voice replies', 'Human takeover'] },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></head>
      <body className={inter.className}>
        <ThemeProvider><AuthProvider><WebsiteContentHydrator />{children}<TrialCta /><Toaster /></AuthProvider></ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
