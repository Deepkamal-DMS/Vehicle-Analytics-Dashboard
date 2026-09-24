# import-workbook

The Edge Function behind the dashboard's **Import Registration Data**
card. See `tools/IMPORT-CHECKS.md` for what it checks and why, and
this file's own `index.ts` header comment for the access-control
story. This file is just how to get it running.

## Files

| File | What it is |
|---|---|
| `index.ts` | The HTTP handler - orchestration only |
| `xlsx-reader.js` | Ported `tools/xlsx-read.js`, Web-standard APIs only |
| `validate.js` | Ported `tools/build-month-tables.js` validation rules |
| `class-columns.js` | Generated - see `generate-class-columns.js` |
| `generate-class-columns.js` | Regenerates `class-columns.js` from `tools/class-columns.js` |

## One-time setup

1. **Install the Supabase CLI** (already available in this repo via
   `npx supabase`, no global install needed).

2. **Link this repo to the live project** (uses the same project the
   dashboard already reads from):

   ```
   npx supabase login
   npx supabase link --project-ref ytgoonducepylslknkag
   ```

3. **Apply the migration** that creates `import_maker_month()`:

   ```
   npx supabase db push
   ```

   This runs `supabase/migrations/20260922120000_import_maker_month.sql`
   against the live database. It only creates one function and grants
   it to `service_role` - see that file's own header for exactly what
   it does and does not touch.

4. **Deploy the function**, with JWT verification off (the dashboard
   has no login yet - see `index.ts`'s header):

   ```
   npx supabase functions deploy import-workbook --no-verify-jwt
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` do not need to be
   set by hand - Supabase injects both into every deployed function
   automatically.

5. **Optional**: restrict which origin can call it (defaults to `*`,
   i.e. any site):

   ```
   npx supabase secrets set IMPORT_ALLOWED_ORIGIN=http://localhost:4173
   ```

   Update this if the dashboard is ever served from somewhere other
   than `localhost:4173` (see `start-dashboard.bat`).

## Redeploying after a change

Any edit to a file in this directory needs a fresh
`npx supabase functions deploy import-workbook --no-verify-jwt` to
take effect - editing the file locally does not change what the
deployed function does.

If `tools/class-columns.js` ever changes (a new Vahan vehicle class),
regenerate in this order and redeploy/reapply both:

```
node supabase/functions/import-workbook/generate-class-columns.js
node tools/generate-import-migration.js
npx supabase db push
npx supabase functions deploy import-workbook --no-verify-jwt
```

## Testing without Supabase

`index.ts`'s `handle()` is a plain function of a Web `Request` that
returns a Web `Response` - no Deno-only API touches it until the
commit path's dynamic `npm:@supabase/supabase-js` import, so the
whole preview path (parsing, every validation rule, error responses)
runs and was tested directly under Node, against all 32 real
workbooks this repo has. See the project's working notes for that
test output if you want to reproduce it; there is no npm-installed
test runner in this repo to re-run it as a script.

## Local database testing

`supabase/migrations/20260922120000_import_maker_month.sql` was
tested directly against this repo's own local Postgres stand-in
(`docker-compose.yml`, the `vad-db` container) before being written
down as final - anon correctly refused, bad month/year/empty-rows
correctly rejected, a real load correctly replaced only its own
(month, year), an unrelated year was left untouched, and re-running
with different rows replaced rather than appended.
