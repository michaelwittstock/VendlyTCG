-- Correcting a real hole opened by the two migrations above.
--
-- WHAT WENT WRONG. Those migrations ended each function with
-- `revoke execute ... from public`, which reads like it locks the function
-- down and does not. Supabase grants EXECUTE on everything in the `public`
-- schema to the `anon` and `authenticated` roles *by name*, and a revoke from
-- PUBLIC does not touch a grant made to a named role. So all four functions
-- stayed callable, unauthenticated, over /rest/v1/rpc/. Caught by the database
-- linter immediately after applying; this fixes it.
--
-- WHAT WAS ACTUALLY EXPOSED, in order of how bad:
--   prune_price_history()  — anyone on the internet could delete price
--                            history. The one thing in this feature that
--                            cannot be rebuilt.
--   watched_card_ids()     — the full list of cards every user is watching,
--                            to anyone. The only cross-user read in the
--                            system, and it was public.
--   verify_cron_secret()   — a free oracle for guessing the cron secret one
--                            attempt at a time.
--   price_history_last_run() — harmless, but signed-out visitors have no
--                            reason to see job telemetry.
--
-- Nothing was reachable for long: the functions were created and this ran in
-- the same session, and price_history was empty apart from a self-test row.

-- Only the Edge Function, which holds the service role key, may call these.
revoke execute on function public.verify_cron_secret(text)      from anon, authenticated;
revoke execute on function public.watched_card_ids()            from anon, authenticated;
revoke execute on function public.prune_price_history(integer)  from anon, authenticated;

-- This one a signed-in user genuinely needs: it is how the watchlist dates its
-- own trend lines instead of implying they are current. Signed-out visitors
-- have no watchlist, so they have no use for it.
revoke execute on function public.price_history_last_run()      from anon;

-- Belt and braces: default privileges in this schema will keep re-granting to
-- anon and authenticated for functions created later. The rule to carry
-- forward is that `revoke ... from public` is not a lock; naming the roles is.
