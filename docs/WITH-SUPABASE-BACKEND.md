# WITH. Supabase backend

Project: `WITH`
Project ref: `ydpwxemszizsmgxewjvr`
Region: `eu-west-1`

## Public intake

Edge Function: `with-waitlist`

Endpoint:

`https://ydpwxemszizsmgxewjvr.supabase.co/functions/v1/with-waitlist`

The function is intentionally public (`verify_jwt = false`) because it serves an unauthenticated website waitlist. It implements its own input validation, exact role allowlist, request size limit, origin allowlist and honeypot filtering.

## Database

Table: `public.waitlist_submissions`

Security model:

- RLS enabled.
- No anonymous or authenticated browser grants.
- No public RLS policies.
- Only the Supabase backend secret/service role writes rows.
- Email uses `citext` and is unique so repeated submissions update one record rather than creating duplicates.
- Consent is required by both application validation and a database check constraint.

Collected fields:

- first name
- last name
- email
- optional phone
- optional city
- participation role
- optional message
- consent
- source
- user agent
- created and updated timestamps

Do not expose Supabase secret or service role keys to the website.