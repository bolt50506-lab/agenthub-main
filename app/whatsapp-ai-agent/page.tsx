import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'WhatsApp AI Agent for Business',
  description: 'Automate WhatsApp customer support, lead capture, sales conversations, appointments and follow-ups with AgentHub AI.',
  alternates: { canonical: '/whatsapp-ai-agent' },
};

export default function WhatsAppAIAgentPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-emerald-300">WhatsApp business automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">WhatsApp AI Agent for customer support, sales and follow-ups</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">AgentHub AI helps businesses handle WhatsApp conversations around the clock. Your AI agent can answer approved business questions, use your products and pricing, capture leads, book appointments, send follow-ups and hand conversations to your team when a human is needed.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {[
            ['Answer customers 24/7', 'Respond quickly using your business knowledge instead of leaving customers waiting.'],
            ['Capture and qualify leads', 'Collect customer details and move serious prospects toward the next action.'],
            ['Book appointments', 'Turn WhatsApp conversations into bookings, reminders, rescheduling and cancellations.'],
            ['Automate follow-ups', 'Re-engage leads automatically when a conversation goes quiet.'],
          ].map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>
        <h2 className="mt-16 text-3xl font-bold">Why use an AI agent on WhatsApp?</h2>
        <p className="mt-5 leading-8 text-slate-300">For many businesses, WhatsApp is where customer questions, sales enquiries and appointment requests arrive first. AgentHub connects those conversations to business actions, so your team spends less time repeating answers and more time handling the conversations that need people.</p>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Start with AgentHub AI</Link></div>
      </article>
    </main>
  );
}
