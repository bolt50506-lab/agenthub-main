import type { Metadata } from 'next';
import Link from 'next/link';

const siteUrl = 'https://agenthubai.vercel.app';

export const metadata: Metadata = {
  title: 'AI Automation Blog | WhatsApp, Sales & Customer Support',
  description: 'Practical guides to AI business automation, WhatsApp customer support, lead follow-up, appointment booking and AI sales for growing businesses.',
  alternates: { canonical: `${siteUrl}/blog` },
};

const posts = [
  ['whatsapp-ai-automation-guide','WhatsApp AI Automation: A Practical Guide for Businesses','Learn how AI can handle customer questions, lead capture, sales conversations, appointments and follow-ups on WhatsApp.'],
  ['automate-whatsapp-customer-support','How to Automate WhatsApp Customer Support','A practical framework for answering repetitive questions while keeping business information and human takeover under control.'],
  ['ai-chatbot-vs-whatsapp-ai-agent','AI Chatbot vs WhatsApp AI Agent: What Is the Difference?','Understand the difference between a basic chatbot and an AI agent that can use business knowledge and complete customer workflows.'],
  ['ai-lead-follow-up','How AI Follow-Up Can Help Businesses Convert More Leads','See how structured follow-up can keep inquiries, quotes and missed opportunities from going cold.'],
  ['ai-appointment-booking-guide','AI Appointment Booking: A Guide for Service Businesses','How conversational AI can handle appointment requests, confirmations, reminders and rescheduling.'],
  ['ai-automation-pakistan','AI Business Automation in Pakistan: What Businesses Can Automate','Practical automation ideas for Pakistani businesses using WhatsApp and other customer channels.'],
  ['whatsapp-automation-pakistan','WhatsApp Automation for Pakistani Businesses','Explore useful WhatsApp automation workflows for sales, support, lead capture and customer follow-up.'],
  ['ai-sales-assistant-small-business','AI Sales Assistant for Small Businesses','How a business AI assistant can qualify leads, answer product questions and move customers toward the next step.'],
];

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-semibold text-violet-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">AgentHub AI Blog</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-bold sm:text-6xl">Practical AI automation guides for modern businesses</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Learn how to automate customer support, WhatsApp conversations, lead follow-up, sales and appointments without losing control of your business.</p>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {posts.map(([slug,title,description]) => (
            <Link key={slug} href={`/blog/${slug}`} className="rounded-2xl border border-white/10 bg-white/[.04] p-7 transition hover:bg-white/[.07]">
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="mt-3 leading-7 text-slate-400">{description}</p>
              <span className="mt-5 inline-block text-sm font-semibold text-violet-300">Read guide →</span>
            </Link>
          ))}
        </div>
      </article>
    </main>
  );
}
