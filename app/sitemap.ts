import type { MetadataRoute } from 'next';

const siteUrl = 'https://agenthubai.vercel.app';

const publicPages = [
  { path: '', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/blog', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/whatsapp-ai-agent', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/ai-customer-support', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/lead-follow-up-automation', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/ai-appointment-booking', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/ai-for-pharmacies', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-clinics', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-real-estate', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-restaurants', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-ecommerce', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-salons', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/ai-for-education', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/blog/whatsapp-ai-automation-guide', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/automate-whatsapp-customer-support', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/ai-chatbot-vs-whatsapp-ai-agent', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/ai-lead-follow-up', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/ai-appointment-booking-guide', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/ai-automation-pakistan', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/whatsapp-automation-pakistan', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/blog/ai-sales-assistant-small-business', priority: 0.7, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicPages.map(({ path, priority, changeFrequency }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
