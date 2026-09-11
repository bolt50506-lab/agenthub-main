import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Customer Support for Businesses | WhatsApp & Multi-Channel',
  description: '24/7 AI customer support for WhatsApp, Instagram, Facebook Messenger and website chat. Answer questions, capture leads, book appointments and automate follow-up with AgentHub AI.',
  alternates: { canonical: '/ai-customer-support' },
};

const channels = [
  ['WhatsApp', 'Handle customer messages, product questions, service enquiries and voice conversations where customers already communicate.'],
  ['Instagram', 'Automate direct-message enquiries while keeping responses grounded in your approved business information.'],
  ['Facebook Messenger', 'Respond to enquiries, qualify prospects and guide customers toward the configured next action.'],
  ['Website chat', 'Give website visitors instant answers, capture lead details and keep conversations moving after business hours.'],
];

const workflows = [
  ['1. Answer instantly', 'Use your approved business knowledge, products, services, prices, policies and FAQs to answer routine questions.'],
  ['2. Capture the opportunity', 'Collect the customer details needed for sales, support or appointments while the conversation is active.'],
  ['3. Take the next action', 'Guide customers toward a booking, enquiry, purchase step, lead capture or human handoff.'],
  ['4. Follow up', 'Reconnect with eligible leads when a conversation becomes inactive instead of leaving the opportunity behind.'],
];

const useCases = [
  ['Sales enquiries', 'Answer product and service questions, share approved pricing and help qualified prospects move toward the next step.'],
  ['Customer service', 'Handle repetitive questions about availability, policies, delivery, opening hours and services before staff need to intervene.'],
  ['Appointments', 'Collect preferred dates and times and connect the conversation to your configured appointment workflow.'],
  ['Lead qualification', 'Ask relevant questions, capture contact details and keep promising prospects organized for your team.'],
  ['After-hours support', 'Continue responding when your team is unavailable, with clear escalation when a human is required.'],
  ['Human takeover', 'Move sensitive, unusual or high-value conversations to staff instead of forcing every case through automation.'],
];

const faqs = [
  ['Can an AI customer support agent work on WhatsApp?', 'Yes. AgentHub is designed around WhatsApp business conversations and can also support website chat, Instagram and Facebook Messenger integrations configured for your business.'],
  ['Does the agent use my business information?', 'The support workflow can be grounded in your configured business information, products, services, prices and policies so routine answers are relevant to your business.'],
  ['Can customers reach a human?', 'Yes. Human takeover is an important part of a reliable automation workflow, especially for exceptions, sensitive requests and conversations outside the configured rules.'],
  ['Is this useful for businesses in Pakistan?', 'Yes. AgentHub is designed for businesses that want conversational automation around WhatsApp and other customer channels, including local sales, support, appointment and follow-up workflows.'],
];

export default function AICustomerSupportPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-violet-300">AI customer support</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI customer support for businesses on WhatsApp and beyond</h1>
        <p className="mt-6 max-w-4xl text-lg leading-8 text-slate-300">AgentHub AI combines customer support with practical business automation. It can answer routine questions, use approved products and prices, capture customer information, help with appointments, qualify leads, automate follow-up and hand conversations to a human whenever required.</p>

        <h2 className="mt-16 text-3xl font-bold">One AI support layer across your channels</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {channels.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">How AI customer support works</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {workflows.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">Business use cases</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <section className="mt-16 rounded-3xl border border-cyan-400/20 bg-cyan-400/[.04] p-8">
          <h2 className="text-3xl font-bold">Built for real customer conversations</h2>
          <p className="mt-4 leading-8 text-slate-300">Good automation should not simply send generic chatbot replies. The agent should work from the information and rules your business provides, keep the customer moving toward a useful next step and know when a person should take over. That approach is especially valuable for WhatsApp-first businesses in Pakistan, where enquiries can arrive throughout the day and night.</p>
        </section>

        <h2 className="mt-16 text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map(([question, answer]) => <section key={question} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-lg font-semibold">{question}</h3><p className="mt-3 leading-7 text-slate-400">{answer}</p></section>)}
        </div>

        <h2 className="mt-16 text-2xl font-bold">Explore related AgentHub automation</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/whatsapp-ai-agent" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">WhatsApp AI agent</Link>
          <Link href="/ai-appointment-booking" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI appointment booking</Link>
          <Link href="/lead-follow-up-automation" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">Lead follow-up automation</Link>
          <Link href="/ai-for-pharmacies" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI for pharmacies</Link>
          <Link href="/ai-for-real-estate" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI for real estate</Link>
          <Link href="/blog/whatsapp-ai-automation-guide" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">WhatsApp AI automation guide</Link>
        </div>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Explore AgentHub AI</Link></div>
      </article>
    </main>
  );
}
