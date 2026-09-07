-- Restore the EXECUTE grants required by authenticated-user RLS policies.
-- These SECURITY DEFINER helpers are intentionally callable by authenticated users
-- because profiles/businesses/business_members policies invoke them during login.
-- PUBLIC/anon remain denied.

grant execute on function public.is_business_admin(uuid) to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_super_admin() to authenticated;

revoke execute on function public.is_business_admin(uuid) from anon;
revoke execute on function public.is_business_member(uuid) from anon;
revoke execute on function public.is_super_admin() from anon;
