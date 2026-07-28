# Database migrations

These are the SQL migrations for the Supabase project `vendly-tcg`
(`qqfshinnpaxvggiscpcd`), kept here so the schema lives in version control and
not only in Supabase's migration history.

INCOMPLETE ON PURPOSE, AND WORTH FIXING: only the watchlist migrations are here.
The four earlier ones (vendly_core_schema, harden_functions, waitlist,
harden_waitlist_constraints) were applied directly against the project before
this directory existed and have not been exported yet. Until they are, this
directory cannot rebuild the database from scratch. Exporting them is a
five-minute job -- `supabase db pull`, or read them out of
`supabase_migrations.schema_migrations`.

Applied via the Supabase API, not the CLI, so there is no local Supabase stack
to run these against yet.
