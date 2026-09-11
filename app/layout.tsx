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
  'Automate WhatsApp, Instagram, Facebook and website chat with AI. Capture leads, book appointments, answer customers and follow up 24/7.';
const siteTitle = 'AI Business Automation for WhatsApp & Pakistan | AgentHub AI';
const logoUrl = `${siteUrl}/agenthub-logo.svg`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: '%s | AgentHub AI' },
  description: siteDescription,
  applicationName: siteName,
  generator: 'Next.js',
  verification: {
    google: 'OGikM_zAaECLMGL5rnTB-vfs0OuSPjJRdJsVdwFBRqI',
  },
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: { icon: logoUrl, shortcut: logoUrl, apple: logoUrl },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: 'en_PK',
    images: [{
      url: '/landing-hero.svg',
      width: 1200,
      height: 630,
      alt: 'AgentHub AI business automation for WhatsApp, Instagram, Facebook and website chat',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/landing-hero.svg'],
  },
};

const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;
const softwareId = `${siteUrl}/#software`;

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: siteName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        '@id': `${siteUrl}/#logo`,
        url: logoUrl,
        contentUrl: logoUrl,
        caption: siteName,
      },
      image: { '@id': `${siteUrl}/#logo` },
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
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: siteName,
      url: siteUrl,
      inLanguage: 'en-PK',
      publisher: { '@id': organizationId },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': softwareId,
      name: siteName,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: siteUrl,
      description: siteDescription,
      publisher: { '@id': organizationId },
      featureList: [
        'AI customer support',
        'WhatsApp business automation',
        'Instagram and Facebook Messenger automation',
        'Website chat',
        'Lead capture',
        'Appointment booking',
        'Automatic follow-ups',
        'AI voice replies',
        'Human takeover',
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/landing-hero.svg?v=bright-agenthub-2" as="image" type="image/svg+xml" fetchPriority="high" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider><AuthProvider><WebsiteContentHydrator />{children}<TrialCta /><Toaster /></AuthProvider></ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
