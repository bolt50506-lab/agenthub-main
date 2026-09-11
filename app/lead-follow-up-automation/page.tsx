import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Lead Follow-Up Automation | WhatsApp Sales Follow-Up',
  description: 'Automatically follow up with leads on WhatsApp, re-engage quiet conversations and keep sales opportunities moving with AgentHub AI.',
  alternates: { canonical: '/lead-follow-up-automation' },
};

const features = [
  ['Capture the lead', 'Collect the details that matter while the customer is already engaged instead of relying on manual notes.'],
  ['Schedule the next touch', 'Use configured follow-up timing so promising conversations do not disappear when a prospect stops replying.'],
  ['Continue the context', 'Keep follow-up messages connected to the original enquiry, products, services and approved business information.'],
  ['Re-engage prospects', 'Bring quiet conversations back to life with useful next-step messages rather than generic reminders.'],
  ['Support sales workflows', 'Move customers from an unanswered question or price enquiry toward a booking, purchase or human conversation.'],
  ['Escalate to humans', 'Let your team take over when a lead is valuable, sensitive, unusual or ready for personal attention.'],
];

const journey = [
  ['Enquiry', 'A customer asks about a product, service, price, availability or appointment through a connected channel.'],
  ['Qualification', 'The agent captures useful details and understands what the customer needs before deciding what should happen next.'],
  ['Follow-up', 'If the conversation becomes inactive, the configured automation can send an appropriate follow-up instead of leaving the lead untouched.'],
  ['Conversion or handoff', 'The customer can continue toward the configured next action, or staff can take over when a human conversation is more appropriate.'],
];

const useCases = [
  ['Price enquiries', 'Follow up with customers who requested pricing but did not continue the conversation.'],
  ['Appointment leads', 'Reconnect with prospects who showed interest in booking but stopped before completing the next step.'],
  ['Product enquiries', 'Keep interested buyers engaged after questions about products, availability or services.'],
  ['Real estate leads', 'Maintain contact with prospects who enquire about properties and need additional information or a human agent.'],
  ['Local businesses', 'Reduce the number of valuable enquiries that are forgotten simply because staff were busy when the message arrived.'],
  ['WhatsApp-first sales', 'Build a repeatable follow-up process around the channel customers already use for direct business conversations.'],
];

const faqs = [
  ['What is AI lead follow-up automation?', 'It is a workflow that uses AI conversations and configured timing to reconnect with eligible leads after an enquiry becomes inactive, helping businesses maintain consistent sales follow-up.'],
  ['Can follow-ups happen on WhatsApp?', 'Yes. AgentHub is designed for WhatsApp business conversations and can connect follow-up workflows to eligible conversations when the relevant integration is configured.'],
  ['Will every customer receive the same message?', 'Follow-up should be connected to the conversation and configured business information rather than relying on one generic message for every situation.'],
  ['Can a salesperson take over?', 'Yes. Human takeover can be used when a lead needs personal attention, a sensitive response or an action outside the automation rules.'],
];

export default function LeadFollowUpAutomationPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Sales follow-up automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI lead follow-up automation that keeps opportunities alive</h1>
        <p className="mt-6 max-w-4xl text-lg leading-8 text-slate-300">AgentHub AI can follow up with eligible leads after a conversation goes quiet. Build a repeatable customer journey around reminders, re-engagement and next steps instead of relying on a team member to remember every prospect.</p>

        <h2 className="mt-16 text-3xl font-bold">What automated lead follow-up can handle</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">From enquiry to conversion</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {journey.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <section className="mt-16 rounded-3xl border border-cyan-400/20 bg-cyan-400/[.04] p-8">
          <h2 className="text-3xl font-bold">Why follow-up automation matters</h2>
          <p className="mt-4 leading-8 text-slate-300">A lead can be genuinely interested without being ready to reply immediately. Staff can miss opportunities because of busy periods, time zones, weekends or simple human forgetfulness. A well-configured follow-up workflow gives businesses a consistent way to reconnect while still allowing customers to reach a person when they need one.</p>
        </section>

        <h2 className="mt-16 text-3xl font-bold">Common business use cases</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map(([question, answer]) => <section key={question} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-lg font-semibold">{question}</h3><p className="mt-3 leading-7 text-slate-400">{answer}</p></section>)}
        </div>

        <h2 className="mt-16 text-2xl font-bold">Build the complete customer journey</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/whatsapp-ai-agent" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">WhatsApp AI agent</Link>
          <Link href="/ai-customer-support" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI customer support</Link>
          <Link href="/ai-appointment-booking" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI appointment booking</Link>
          <Link href="/ai-for-real-estate" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI for real estate</Link>
          <Link href="/blog/ai-lead-follow-up" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI lead follow-up guide</Link>
          <Link href="/blog/whatsapp-ai-automation-guide" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">WhatsApp automation guide</Link>
        </div>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Automate your follow-ups</Link></div>
      </article>
    </main>
  );
}
