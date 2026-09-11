import type { MetadataRoute } from 'next';

const siteUrl = 'https://agenthubai.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicPages = [
    { path: '', priority: 1 },
    { path: '/seo/whatsapp-ai-agent', priority: 0.9 },
    { path: '/seo/ai-customer-support', priority: 0.9 },
    { path: '/seo/lead-follow-up-automation', priority: 0.9 },
    { path: '/seo/ai-appointment-booking', priority: 0.9 },
  ];

  return [
    ...publicPages.map(({ path, priority }) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority,
    })),
    {
      url: `${siteUrl}/login`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
  ];
}
