import type { MetadataRoute } from 'next';

const siteUrl = 'https://agenthubai.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicPages = [
    { path: '', priority: 1 },
    { path: '/blog', priority: 0.9 },
    { path: '/seo/whatsapp-ai-agent', priority: 0.9 },
    { path: '/seo/ai-customer-support', priority: 0.9 },
    { path: '/seo/lead-follow-up-automation', priority: 0.9 },
    { path: '/seo/ai-appointment-booking', priority: 0.9 },
    { path: '/blog/whatsapp-ai-automation-guide', priority: 0.7 },
    { path: '/blog/automate-whatsapp-customer-support', priority: 0.7 },
    { path: '/blog/ai-chatbot-vs-whatsapp-ai-agent', priority: 0.7 },
    { path: '/blog/ai-lead-follow-up', priority: 0.7 },
    { path: '/blog/ai-appointment-booking-guide', priority: 0.7 },
    { path: '/blog/ai-automation-pakistan', priority: 0.7 },
    { path: '/blog/whatsapp-automation-pakistan', priority: 0.7 },
    { path: '/blog/ai-sales-assistant-small-business', priority: 0.7 },
  ];

  return publicPages.map(({ path, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path.startsWith('/blog/') ? 'monthly' as const : 'weekly' as const,
    priority,
  }));
}
