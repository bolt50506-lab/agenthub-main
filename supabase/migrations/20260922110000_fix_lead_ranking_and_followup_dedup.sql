-- Persistent lead scoring/ranking and automated follow-up deduplication.
alter table public.leads
  add column if not exists lead_score integer not null default 20,
  add column if not exists lead_temperature text not null default 'cold';

create or replace function public.calculate_lead_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare s integer := 20;
begin
  if new.status = 'won' then s := 100;
  elsif new.status = 'lost' then s := 0;
  else
    if new.status = 'contacted' then s := s + 15;
    elsif new.status = 'qualified' then s := s + 35;
    elsif new.status = 'appointment_booked' then s := s + 45;
    elsif new.status = 'proposal' then s := s + 55;
    end if;
    if nullif(trim(coalesce(new.budget,'')), '') is not null then s := s + 10; end if;
    if nullif(trim(coalesce(new.interested_product,'')), '') is not null then s := s + 10; end if;
    if nullif(trim(coalesce(new.requirement,'')), '') is not null then s := s + 10; end if;
    if nullif(trim(coalesce(new.phone,'')), '') is not null or nullif(trim(coalesce(new.email,'')), '') is not null then s := s + 5; end if;
    s := least(s,99);
  end if;
  new.lead_score := s;
  new.lead_temperature := case when s >= 80 then 'hot' when s >= 60 then 'warm' else 'cold' end;
  return new;
end;
$$;

drop trigger if exists trg_calculate_lead_score on public.leads;
create trigger trg_calculate_lead_score
before insert or update of status,budget,interested_product,requirement,phone,email
on public.leads
for each row execute function public.calculate_lead_score();

update public.leads
set lead_score = case
  when status='won' then 100
  when status='lost' then 0
  else least(99,
    20
    + case status when 'contacted' then 15 when 'qualified' then 35 when 'appointment_booked' then 45 when 'proposal' then 55 else 0 end
    + case when nullif(trim(coalesce(budget,'')),'') is not null then 10 else 0 end
    + case when nullif(trim(coalesce(interested_product,'')),'') is not null then 10 else 0 end
    + case when nullif(trim(coalesce(requirement,'')),'') is not null then 10 else 0 end
    + case when nullif(trim(coalesce(phone,'')),'') is not null or nullif(trim(coalesce(email,'')),'') is not null then 5 else 0 end
  )
end,
lead_temperature = case
  when status='won' then 'hot'
  when status='lost' then 'cold'
  else case
    when lead_score >= 80 then 'hot'
    when lead_score >= 60 then 'warm'
    else 'cold'
  end
end;

create index if not exists idx_leads_business_score on public.leads(business_id, lead_score desc, created_at desc);
create unique index if not exists uq_automated_followup_number_per_lead
  on public.follow_up_tasks(lead_id, followup_number)
  where automation_generated = true and followup_number is not null;
