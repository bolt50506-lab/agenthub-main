type ArticleSchemaProps = {
  title: string;
  description: string;
  url: string;
};

export function ArticleSchema({ title, description, url }: ArticleSchemaProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: {
      '@type': 'Organization',
      name: 'AgentHub AI',
      url: 'https://agenthubai.vercel.app',
    },
    publisher: {
      '@type': 'Organization',
      name: 'AgentHub AI',
      url: 'https://agenthubai.vercel.app',
      logo: {
        '@type': 'ImageObject',
        url: 'https://agenthubai.vercel.app/agenthub-logo.svg',
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbSchema({ title, url }: { title: string; url: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://agenthubai.vercel.app/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'AI Automation Blog',
        item: 'https://agenthubai.vercel.app/blog',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: url,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
