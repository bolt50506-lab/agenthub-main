import type { Metadata } from 'next';
import Link from 'next/link';

const siteUrl = 'https://agenthubai.vercel.app';

export const metadata: Metadata = {
  title: 'WhatsApp AI Agent for Business',
  description: 'Automate WhatsApp customer support, lead capture, sales conversations, appointments and follow-ups with AgentHub AI.',
  alternates: { canonical: `${siteUrl}/seo/whatsapp-ai-agent` },
};

export default function WhatsAppAiAgentPage() {
  return <main className="min-h-screen bg-[#050816] px-6 py-20 text-white"><article className="mx-auto max-w-4xl"><p className="text-sm font-semibold uppercase tracking-[.2em] text-emerald-300">WhatsApp AI Agent</p><h1 className="mt-4 text-4xl font-bold sm:text-6xl">Automate WhatsApp customer conversations with AI</h1><p className="mt-6 text-lg leading-8 text-slate-300">AgentHub AI helps businesses answer WhatsApp messages, use approved products and pricing, capture leads, book appointments, send follow-ups and hand conversations to a human when needed.</p><div className="mt-10 grid gap-5 sm:grid-cols-2">{['24/7 WhatsApp customer support','Lead capture and qualification','Products, services and pricing knowledge','Appointment booking and reminders','Automatic lead follow-ups','Human takeover when needed'].map(x=><section key={x} className="rounded-2xl border border-white/10 bg-white/[.04] p-6"><h2 className="font-semibold">{x}</h2><p className="mt-2 text-sm leading-6 text-slate-400">Keep routine customer conversations moving without requiring your team to answer every message manually.</p></section>)}</div><div className="mt-12 flex flex-wrap gap-4"><Link href="/" className="rounded-xl bg-violet-600 px-6 py-3 font-semibold">Explore AgentHub AI</Link><Link href="/seo/ai-customer-support" className="rounded-xl border border-white/15 px-6 py-3 font-semibold">AI customer support</Link><Link href="/seo/lead-follow-up-automation" className="rounded-xl border border-white/15 px-6 py-3 font-semibold">Lead follow-up automation</Link></div></article></main>;
}
