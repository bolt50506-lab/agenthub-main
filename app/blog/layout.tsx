import Link from 'next/link';
import { ArticleSchema, BreadcrumbSchema } from './_components/article-schema';

const siteUrl = 'https://agenthubai.vercel.app';

const articles: Record<string, { title: string; description: string }> = {
  'whatsapp-ai-automation-guide': {
    title: 'WhatsApp AI Automation: A Practical Guide for Businesses',
    description: 'A practical guide to automating WhatsApp support, lead capture, sales conversations, appointments and follow-up for businesses.',
  },
  'automate-whatsapp-customer-support': {
    title: 'How to Automate WhatsApp Customer Support',
    description: 'Learn how businesses can automate WhatsApp customer support with business knowledge, escalation rules and human takeover.',
  },
  'ai-chatbot-vs-whatsapp-ai-agent': {
    title: 'AI Chatbot vs WhatsApp AI Agent: What Is the Difference?',
    description: 'Understand the difference between a basic AI chatbot and a WhatsApp AI agent designed to complete business workflows.',
  },
  'ai-lead-follow-up': {
    title: 'How AI Follow-Up Can Help Businesses Convert More Leads',
    description: 'Learn how structured AI lead follow-up can help businesses respond consistently, re-engage prospects and reduce missed opportunities.',
  },
  'ai-appointment-booking-guide': {
    title: 'AI Appointment Booking: A Guide for Service Businesses',
    description: 'Learn how conversational AI can handle appointment requests, confirmations, reminders, rescheduling and cancellations.',
  },
  'ai-automation-pakistan': {
    title: 'AI Business Automation in Pakistan: What Businesses Can Automate',
    description: 'Explore practical AI business automation opportunities for Pakistani businesses, including customer support, leads, sales and follow-up.',
  },
  'whatsapp-automation-pakistan': {
    title: 'WhatsApp Automation for Pakistani Businesses',
    description: 'A practical guide to using WhatsApp automation for sales, customer support, lead capture and follow-up in Pakistan.',
  },
  'ai-sales-assistant-small-business': {
    title: 'AI Sales Assistant for Small Businesses',
    description: 'Learn how an AI sales assistant can qualify leads, answer product questions and guide customers toward the next step.',
  },
};

export default function BlogLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug?: string };
}) {
  const slug = params.slug;
  const article = slug ? articles[slug] : undefined;
  const url = article ? `${siteUrl}/blog/${slug}` : '';

  return (
    <>
      {article && (
        <>
          <ArticleSchema title={article.title} description={article.description} url={url} />
          <BreadcrumbSchema title={article.title} url={url} />
          <nav aria-label="Breadcrumb" className="bg-[#050816] px-6 pt-6 text-sm text-slate-400">
            <ol className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="transition hover:text-white">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/blog" className="transition hover:text-white">AI Automation Blog</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-slate-300">{article.title}</li>
            </ol>
          </nav>
        </>
      )}
      {children}
    </>
  );
}
