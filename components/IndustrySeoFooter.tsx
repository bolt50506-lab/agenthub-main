import Link from 'next/link';

const industries = [
  ['Pharmacies', '/ai-for-pharmacies'],
  ['Clinics', '/ai-for-clinics'],
  ['Real estate', '/ai-for-real-estate'],
  ['Restaurants', '/ai-for-restaurants'],
  ['E-commerce', '/ai-for-ecommerce'],
  ['Salons', '/ai-for-salons'],
  ['Education', '/ai-for-education'],
] as const;

const faqs = [
  ['Can AgentHub AI work on WhatsApp?', 'Yes. AgentHub AI is designed to automate business conversations on WhatsApp and can also support website chat and other connected channels.'],
  ['Can businesses control what the AI says?', 'Yes. Businesses can provide approved business information, products, pricing and workflow rules, with human escalation for requests that need staff.'],
  ['Can AgentHub AI capture leads and follow up?', 'Yes. It can capture customer enquiries and use follow-up automation to re-engage eligible leads when conversations become inactive.'],
  ['Can customers be handed to a human?', 'Yes. Human handoff can be used when a conversation is sensitive, complex or outside the AI agent’s approved scope.'],
];

export default function IndustrySeoFooter() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return <>
    <section className="mx-auto mt-16 max-w-4xl">
      <h2 className="text-3xl font-bold">Frequently asked questions</h2>
      <div className="mt-6 space-y-4">
        {faqs.map(([question, answer]) => <details key={question} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 leading-7 text-slate-400">{answer}</p></details>)}
      </div>
    </section>
    <nav aria-label="AgentHub AI industries" className="mx-auto mt-14 max-w-4xl border-t border-white/10 pt-8">
      <p className="text-sm font-semibold text-slate-300">Explore AI automation by industry</p>
      <div className="mt-4 flex flex-wrap gap-3">{industries.map(([label, href]) => <Link key={href} href={href} className="rounded-full border border-white/10 px-4 py-2 text-sm text-cyan-300 hover:bg-white/5">{label}</Link>)}</div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm"><Link href="/whatsapp-ai-agent" className="text-emerald-300">WhatsApp AI Agent</Link><Link href="/ai-customer-support" className="text-violet-300">AI Customer Support</Link><Link href="/lead-follow-up-automation" className="text-cyan-300">Lead Follow-Up Automation</Link><Link href="/ai-appointment-booking" className="text-indigo-300">AI Appointment Booking</Link><Link href="/blog" className="text-slate-300">AI Automation Blog</Link></div>
    </nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  </>;
}
