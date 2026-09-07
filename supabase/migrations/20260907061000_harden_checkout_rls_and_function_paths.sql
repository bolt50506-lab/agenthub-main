alter table public.public_checkout_orders enable row level security;

drop policy if exists "public checkout orders are publicly readable" on public.public_checkout_orders;
drop policy if exists "public checkout orders are publicly writable" on public.public_checkout_orders;

revoke execute on function public.agenthub_expire_human_takeovers() from anon;
revoke execute on function public.agenthub_expire_human_takeovers() from public;
revoke execute on function public.enforce_ai_usage_limit_trigger() from anon;
revoke execute on function public.enforce_ai_usage_limit_trigger() from public;
revoke execute on function public.enforce_plan_limit_trigger() from anon;
revoke execute on function public.enforce_plan_limit_trigger() from public;
revoke execute on function public.sync_payment_verification_from_order() from anon;
revoke execute on function public.sync_payment_verification_from_order() from public;

alter function public.agenthub_auto_resume_ai_on_customer_message() set search_path = public;
alter function public.agenthub_set_ai_resume_deadline() set search_path = public;
alter function public.set_lead_conversion_timestamp() set search_path = public;
alter function public.touch_payment_verification_updated_at() set search_path = public;
alter function public.update_commerce_payment_totals() set search_path = public;
alter function public.update_appointment_payment_totals() set search_path = public;
alter function public.issue_customer_payment_receipt() set search_path = public;
alter function public.mark_lead_converted_from_paid_order() set search_path = public;
