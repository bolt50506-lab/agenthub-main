revoke execute on function public.check_plan_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public.create_business_with_plan(text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.enforce_ai_usage_limit_trigger() from public, anon, authenticated;
revoke execute on function public.enforce_plan_limit_trigger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_business_admin(uuid) from public, anon, authenticated;
revoke execute on function public.is_business_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_super_admin() from public, anon, authenticated;
revoke execute on function public.update_business_subscription_status(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
