import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Customer Support for Business',
  description: 'Give customers 24/7 AI support across WhatsApp, Instagram, Facebook Messenger and website chat with AgentHub AI.',
  alternates: { canonical: '/ai-customer-support' },
};

export default function AICustomerSupportPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-violet-300">AI customer support</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI customer support that can actually move the conversation forward</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">AgentHub AI combines customer support with business automation. It can answer questions, use your approved products and prices, capture customer information, schedule appointments, follow up with leads and hand off to a human whenever required.</p>
        <h2 className="mt-16 text-3xl font-bold">One AI support layer across your channels</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            ['WhatsApp', 'Handle customer messages, sales questions and voice conversations.'],
            ['Instagram', 'Automate direct-message conversations without losing your business tone.'],
            ['Facebook Messenger', 'Respond to customer enquiries and move prospects toward action.'],
            ['Website chat', 'Give website visitors instant answers and capture leads day and night.'],
          ].map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>
        <h2 className="mt-16 text-3xl font-bold">Support without creating another inbox</h2>
        <p className="mt-5 leading-8 text-slate-300">Instead of making customers wait for a staff member to answer every routine question, AgentHub can provide an always-on first response while keeping your team in control of escalations and sensitive conversations.</p>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Explore AgentHub AI</Link></div>
      </article>
    </main>
  );
}
