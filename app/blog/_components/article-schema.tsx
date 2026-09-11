export function ArticleSchema({ title, description, url }: { title: string; description: string; url: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    publisher: { '@type': 'Organization', name: 'AgentHub AI', url: 'https://agenthubai.vercel.app' },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
