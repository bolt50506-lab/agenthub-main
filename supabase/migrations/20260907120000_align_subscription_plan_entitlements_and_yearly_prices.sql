update public.subscription_plans
set
  yearly_price_cents = case slug
    when 'starter' then 33408
    when 'professional' then 88116
    when 'enterprise' then 214920
  end,
  features = case slug
    when 'starter' then jsonb_build_array(
      '1 AI Agent',
      '500 conversations/month',
      '3 team members',
      '500 MB storage',
      '100 leads',
      '200 appointments',
      '20 knowledge items',
      '50 products',
      '3 integrations',
      '1,000 AI usage units/month',
      'Email support',
      'Basic analytics',
      '1 cloned AI voice'
    )
    when 'professional' then jsonb_build_array(
      '10 AI Agents',
      '5,000 conversations/month',
      '10 team members',
      '5 GB storage',
      '1,000 leads',
      '2,000 appointments',
      '200 knowledge items',
      '500 products',
      '10 integrations',
      '10,000 AI usage units/month',
      'Priority support',
      'Advanced analytics',
      'Custom agent training',
      'Group AI rules',
      'Image analysis',
      '2 cloned AI voices'
    )
    when 'enterprise' then jsonb_build_array(
      '50 AI Agents',
      'Unlimited conversations',
      '50 team members',
      'Unlimited storage',
      '10,000 leads',
      '10,000 appointments',
      '1,000 knowledge items',
      '2,000 products',
      '50 integrations',
      '100,000 AI usage units/month',
      '24/7 phone support',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'On-premise deployment option',
      'Custom AI model training',
      '4 cloned AI voices'
    )
  end,
  updated_at = now()
where slug in ('starter','professional','enterprise');
