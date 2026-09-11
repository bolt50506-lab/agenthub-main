import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'WhatsApp AI Agent for Business',
  description: 'Use a WhatsApp AI agent to answer customers, capture leads, sell, book appointments and automate follow-ups 24/7 with AgentHub AI.',
  alternates: { canonical: '/whatsapp-ai-agent' },
};

const capabilities = [
  ['Answer customers 24/7', 'Respond quickly using your approved business knowledge, FAQs, products and pricing instead of leaving customers waiting.'],
  ['Capture and qualify leads', 'Collect useful customer details, understand intent and move serious prospects toward a call, quotation, purchase or booking.'],
  ['Book appointments', 'Turn WhatsApp conversations into appointment requests, confirmations, reminders, rescheduling and cancellations.'],
  ['Automate follow-ups', 'Re-engage leads automatically when a conversation goes quiet, helping businesses recover opportunities without manual chasing.'],
  ['Support sales conversations', 'Handle product questions, availability and common objections before handing high-value or complex conversations to your team.'],
  ['Human takeover', 'Escalate conversations when a customer needs a person, keeping automation useful without removing your team from important interactions.'],
];

export default function WhatsAppAIAgentPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-emerald-300">WhatsApp business automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">WhatsApp AI Agent for customer support, sales and follow-ups</h1>
        <p className="mt-6 max-w-4xl text-lg leading-8 text-slate-300">AgentHub AI helps businesses handle WhatsApp conversations around the clock. Your AI agent can answer approved business questions, use your products and pricing, capture leads, book appointments, send follow-ups and hand conversations to your team when a human is needed.</p>

        <section className="mt-12 rounded-3xl border border-emerald-400/20 bg-emerald-400/[.05] p-7 sm:p-10">
          <h2 className="text-2xl font-bold sm:text-3xl">What a WhatsApp AI agent can do for your business</h2>
          <p className="mt-4 leading-8 text-slate-300">Instead of treating WhatsApp as only a messaging inbox, AgentHub turns customer conversations into a business workflow. A visitor can ask a question, receive an approved answer, share contact details, request an appointment or continue toward a sale without your staff manually repeating the same steps.</p>
        </section>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {capabilities.map(([title, text]) => (
            <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 leading-7 text-slate-400">{text}</p>
            </section>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="text-3xl font-bold">How WhatsApp automation works</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-4">
            {[
              ['1', 'Customer messages', 'A customer starts a WhatsApp conversation with a question, enquiry or request.'],
              ['2', 'AI understands intent', 'AgentHub uses your configured business knowledge and conversation context to determine the next response.'],
              ['3', 'Business action', 'The agent can capture a lead, provide information, support a sale, or move the customer toward an appointment.'],
              ['4', 'Follow-up or handoff', 'The conversation can continue automatically, trigger follow-up, or be handed to your team when appropriate.'],
            ].map(([number, title, text]) => (
              <div key={number} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
                <span className="text-sm font-bold text-emerald-300">STEP {number}</span>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-white/10 bg-white/[.03] p-7 sm:p-10">
          <h2 className="text-3xl font-bold">Built for Pakistani businesses</h2>
          <p className="mt-4 leading-8 text-slate-300">WhatsApp is central to customer communication for many businesses in Pakistan. AgentHub is designed around practical workflows such as lead enquiries, product and price questions, appointment requests and follow-up. Businesses can build their agent around their own information instead of forcing customers through a generic chatbot.</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
            {['WhatsApp customer support', 'Lead generation', 'Sales automation', 'Appointment booking', 'Follow-up automation', 'Human handoff'].map(item => <span key={item} className="rounded-full border border-white/10 px-4 py-2">{item}</span>)}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-3xl font-bold">Explore related AgentHub solutions</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Link href="/ai-customer-support" className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.04]"><strong>AI Customer Support</strong><p className="mt-2 text-sm text-slate-400">Automate repetitive customer questions across channels.</p></Link>
            <Link href="/lead-follow-up-automation" className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.04]"><strong>Lead Follow-up</strong><p className="mt-2 text-sm text-slate-400">Keep prospects engaged after the first enquiry.</p></Link>
            <Link href="/ai-appointment-booking" className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.04]"><strong>AI Appointment Booking</strong><p className="mt-2 text-sm text-slate-400">Turn conversations into organized bookings.</p></Link>
          </div>
        </section>

        <div className="mt-12"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Start with AgentHub AI</Link></div>
      </article>
    </main>
  );
}
