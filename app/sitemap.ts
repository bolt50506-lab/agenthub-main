import type { MetadataRoute } from 'next';

const siteUrl = 'https://agenthubai.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
