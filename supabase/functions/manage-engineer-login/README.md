# manage-engineer-login (V1)

Supabase Edge Function for admin-only Engineering account management.
Source only — **not deployed yet**.

Built on the current (2026) `@supabase/server` package (`withSupabase`,
`ctx.supabase` / `ctx.supabaseAdmin`) rather than manually constructing
`@supabase/supabase-js` clients from raw env vars.

## Actions

Single endpoint, `POST` with JSON body `{ "action": "...", "engineer_id": N, "email": "..." }`
(`email` only required for `invite`).

- `invite` — link an existing Engineer row to a new Supabase Auth account via
  email invitation. Rejects if the Engineer doesn't exist or is already linked.
  On success, returns `{ ok: true, engineer_id, email }` — no `auth_user_id`
  is returned to the browser; V1's UI has no use for it.
- `disable` — bans the Engineer's linked Auth user and sets `login_enabled = false`.
  Does not touch the Engineer row itself or delete anything. **An admin
  cannot disable their own login** (see below) — this is checked server-side
  against the caller's own verified identity, not anything sent from the browser.
- `reenable` — lifts the ban and sets `login_enabled = true`.

All three require the caller's own Supabase session (sent as the normal
`Authorization: Bearer <access_token>` header, exactly what
`supabase.functions.invoke(...)` already sends) to resolve, via the
`Engineers` table, to a row with `is_admin = true`, `login_enabled = true`,
and `active = true`. Nothing about admin status, or the caller's own
Engineer ID, is ever read from the request body.

## Authorization mechanism (revised)

`withSupabase({ auth: 'user' })` verifies the caller's JWT against the
project's own signing keys **before the handler runs at all** — a request
with a missing or invalid JWT never reaches this code, and `withSupabase`
already returns the 401 for it. This replaces the earlier draft's manual
`createClient(...).auth.getUser()` call: `ctx.userClaims.id` is already a
verified Auth UID by the time the handler sees it.

The handler then reads `ctx.supabase` — a client `withSupabase` builds using
the caller's own JWT, so Row-Level Security applies exactly as it would if
the caller queried Supabase directly from the browser. Looking up
`Engineers` filtered by `auth_user_id = ctx.userClaims.id` can only ever
return the caller's own row, however the query is written — there's no way
for the request to make it return someone else's row. Only if that row has
`is_admin = true`, `login_enabled = true`, and `active = true` does the
handler proceed to use `ctx.supabaseAdmin` (RLS-bypassing) for the actual
privileged operation.

## Self-disable protection

The caller's own Engineer ID comes from that same server-resolved lookup
(`callerEngineer.id`), never from the request body. `disable` compares the
requested `engineer_id` against it and rejects with `403` if they match —
so there's no way for the currently-signed-in admin to lock themselves out,
by mistake or otherwise. Since Tony is presently the only admin, this
matters: with no working invite/disable flow yet for a second admin, a
self-disable would require the Supabase Dashboard to undo.

## Disable / reenable partial-failure design

Both `disable` and `reenable` are two non-transactional steps — one Auth
Admin API call, one Postgres write — that can fail independently. Each
action is ordered, and each failure is compensated, so that **the worst
possible outcome of any failure is always "the account still can't log
in," never a silent access grant**:

- **disable**: bans the Auth user first (removes access), then sets
  `login_enabled = false` second.
  - If the DB update fails: the account **is** already banned (safe), but
    the Engineer row would be left stale claiming it's still enabled. The
    function automatically un-bans to fully roll back to the pre-action
    state and reports a "safe to retry" error — nothing was left half-done.
  - If that rollback (the un-ban) *also* fails: the account stays banned
    (still safe — it can't log in), the Engineer row incorrectly still
    says enabled, and the function reports a loud, specific error asking
    for manual reconciliation in Supabase, rather than pretending success.
- **reenable**: the reverse order, for the same reason — sets
  `login_enabled = true` first, then lifts the ban second.
  - If lifting the ban fails: the function automatically rolls the
    Engineer row back to `login_enabled = false`, so the record can never
    claim someone can log in while Auth still has them banned. Reports a
    "safe to retry" error.
  - If that rollback *also* fails: the Engineer row may incorrectly show
    `login_enabled = true`, but the account is **still actually banned in
    Auth** — so, again, nobody is silently granted access. The function
    reports a loud error asking for manual reconciliation.

In every one of these failure branches, the response `error` message states
plainly what state things were left in and whether a retry is safe — no
branch reports `ok: true` unless both steps genuinely succeeded.

## Current Supabase configuration/deployment requirements

**On the hosted Supabase platform, this requires no manual secrets at all**
— confirmed directly against the `@supabase/server` package source, not
just its docs. `withSupabase`/`ctx.supabaseAdmin` resolve everything from
environment variables the platform auto-injects into every Edge Function:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, and
`SUPABASE_JWKS` (or it's derived automatically from the project URL). No
`supabase secrets set` step, and no `supabase/config.toml` entry, is needed
for this function — `verify_jwt` defaults to `true`, which is exactly what
`auth: 'user'` needs.

**One real caveat, worth checking before deploying, not assuming:**
`@supabase/server`'s env resolution reads *only* the new
`SUPABASE_PUBLISHABLE_KEY(S)` / `SUPABASE_SECRET_KEY(S)` variables — it does
**not** fall back to the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
names the rest of this repo's client code still uses. Supabase's stated
migration timeline has anon/service_role keys deprecated by the end of 2026
and says the new variables are auto-provisioned for all projects on the
platform — but that's Supabase's documentation, not a direct observation of
this specific project. Before deploying, check the project's Dashboard
(Settings → API) for publishable/secret keys, or just deploy to a throwaway
test function first and confirm `ctx.supabaseAdmin` actually works — if the
project hasn't been migrated yet, this function would need to fall back to
the older manual-client-construction pattern instead.

## Proposed deploy procedure (not yet executed)

```bash
# from the repo root, once the Supabase CLI is linked to the project
supabase functions deploy manage-engineer-login
```

That's it — no secrets to set, assuming the caveat above checks out.

## Proposed manual test procedure (not yet executed)

1. In a browser console already signed in to engineer.html as Tony (admin),
   grab the current session's access token:
   ```js
   (await sb.auth.getSession()).data.session.access_token
   ```
2. Call the deployed function directly to test `invite` against a real but
   disposable test Engineer row (not a live production engineer) before any
   UI is wired up:
   ```bash
   curl -i -X POST \
     'https://<project-ref>.functions.supabase.co/manage-engineer-login' \
     -H "Authorization: Bearer <access token from step 1>" \
     -H "Content-Type: application/json" \
     -d '{"action":"invite","engineer_id":<test engineer id>,"email":"<test inbox>"}'
   ```
3. Confirm in the Supabase Dashboard (Auth > Users) that exactly one new
   user was created, and in `Engineers` that the row now has the expected
   `auth_user_id`, `email`, and `login_enabled = true`.
4. Test `disable` then `reenable` the same way against the same test row.
5. Negative tests before trusting this in production:
   - Call with no `Authorization` header → expect `401` (from `withSupabase`
     itself, before this function's own code runs).
   - Call with a valid session belonging to a non-admin engineer → expect `403`.
   - Call `disable` with `engineer_id` equal to Tony's own Engineer ID while
     signed in as Tony → expect `403` ("You cannot disable your own login").
   - Call `invite` twice for the same `engineer_id` → second call → expect `409`.
   - Call `invite` with an `email` that already has an Auth account → expect
     the Supabase Auth error surfaced as a `400`, and confirm no Engineers
     row was modified.
6. The disable/reenable rollback paths (partial-failure compensation) are
   defended by code review and the ordering argument above, not by a live
   forced-failure test — there's no easy, safe way to make the *second* step
   of a service-role write fail on demand without deliberately breaking
   something in the project. Worth keeping in mind as a residual risk, not
   something this test plan claims to have exercised.

Only after all of the above pass against test data should this be wired into
any `engineer.html` UI (a separate, later, explicitly-approved step).
