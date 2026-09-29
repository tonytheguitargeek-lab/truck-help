// Truck Help — Engineering account management (V1)
//
// Actions: invite, disable, reenable
//
// SECURITY MODEL
// ---------------
// - This function is the ONLY place in the whole system that ever holds
//   the Supabase secret key. `withSupabase` resolves it from the platform's
//   own auto-injected environment (SUPABASE_SECRET_KEYS) and hands it back
//   as ctx.supabaseAdmin — it is never sent to, or read by, engineer.html
//   or any other browser code.
// - `withSupabase({ auth: 'user' })` verifies the caller's JWT against the
//   project's own signing keys BEFORE this handler ever runs. ctx.userClaims
//   is therefore already a verified identity, not something read from the
//   request body — a request with no valid JWT never reaches this code.
// - ctx.userClaims.id (the verified Auth UID) is used to look up the
//   caller's own row in Engineers, via ctx.supabase, by explicitly
//   filtering Engineers.auth_user_id to that verified UID. The security
//   property this relies on is that ctx.userClaims.id itself is verified
//   (checked against the project's signing keys before this handler runs)
//   and is never taken from the request body — not that RLS alone
//   guarantees the query's scope. The request is refused unless the
//   returned row has is_admin = true, login_enabled = true, and
//   active = true. An engineer_id, admin flag, or authorization claim
//   supplied by the browser is NEVER trusted for this check.
// - Only after that passes is ctx.supabaseAdmin (service-role-equivalent,
//   bypasses RLS) used to perform the actual privileged Auth Admin
//   operation.
//
// See README.md in this directory for required configuration, deployment,
// and a manual test procedure. Nothing in this file has been deployed yet.

import { withSupabase } from "npm:@supabase/server@^1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ACTIONS = new Set(["invite", "disable", "reenable"]);

function jsonResponse(body: unknown, status: number = 200) {
  return Response.json(body, { status });
}

function isPlausibleEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const action = body && body.action;
    const engineerId = body && body.engineer_id;
    const email = body && body.email;

    if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
      return jsonResponse({ error: "Unknown or missing action." }, 400);
    }

    if (!Number.isInteger(engineerId)) {
      return jsonResponse({ error: "engineer_id must be an integer." }, 400);
    }

    const callerAuthUserId = ctx.userClaims && ctx.userClaims.id;

    if (!callerAuthUserId) {
      // Should be unreachable under auth: 'user' — withSupabase would have
      // already rejected the request — but never assume it upstream.
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const { data: callerEngineer, error: callerLookupError } = await ctx.supabase
      .from("Engineers")
      .select("id, is_admin, login_enabled, active")
      .eq("auth_user_id", callerAuthUserId)
      .maybeSingle();

    if (callerLookupError) {
      console.error("manage-engineer-login: caller lookup failed.");
      return jsonResponse({ error: "Could not verify caller." }, 500);
    }

    const isAuthorizedAdmin =
      !!callerEngineer &&
      callerEngineer.is_admin === true &&
      callerEngineer.login_enabled === true &&
      callerEngineer.active === true;

    if (!isAuthorizedAdmin) {
      return jsonResponse({ error: "Not authorized." }, 403);
    }

    if (action === "invite") {
      return await handleInvite(ctx.supabaseAdmin, engineerId, email);
    }

    // Neither disable nor reenable may target the caller's own Engineer
    // record. The comparison uses callerEngineer.id, resolved server-side
    // above — never the engineer_id supplied in the request body.
    if (engineerId === callerEngineer.id) {
      return jsonResponse(
        { error: "You cannot " + action + " your own login." },
        403,
      );
    }

    if (action === "disable") {
      return await handleDisable(ctx.supabaseAdmin, engineerId);
    }

    return await handleReenable(ctx.supabaseAdmin, engineerId);
  }),
};

async function handleInvite(adminClient: SupabaseClient, engineerId: number, email: unknown) {
  if (!isPlausibleEmail(email)) {
    return jsonResponse({ error: "A valid email is required." }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data: engineer, error: engineerError } = await adminClient
    .from("Engineers")
    .select("id, auth_user_id")
    .eq("id", engineerId)
    .maybeSingle();

  if (engineerError) {
    console.error("manage-engineer-login: engineer lookup failed during invite.");
    return jsonResponse({ error: "Could not look up engineer." }, 500);
  }

  if (!engineer) {
    return jsonResponse({ error: "Engineer not found." }, 404);
  }

  if (engineer.auth_user_id) {
    return jsonResponse({ error: "This engineer already has a linked login." }, 409);
  }

  // Failure-ordering / partial-failure design:
  //
  // Creating the Auth user and linking the Engineers row are two separate,
  // non-transactional operations. We do the side effect that is hard to
  // undo blindly (the Auth invite) FIRST, then attempt the DB link SECOND,
  // so that if the DB step fails we still have a single, well-known
  // compensating action available: delete the Auth user we just created,
  // fully returning to the pre-action state. If that rollback also fails,
  // we do not report success — we return a loud, specific error asking for
  // manual reconciliation, rather than silently leaving an orphaned Auth
  // account with no Engineer link.
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
  );

  if (inviteError) {
    return jsonResponse({ error: "Could not send invitation: " + inviteError.message }, 400);
  }

  const newAuthUserId = inviteData && inviteData.user && inviteData.user.id;

  if (!newAuthUserId) {
    console.error("manage-engineer-login: invite succeeded but returned no user id.");
    return jsonResponse(
      {
        error:
          "Invitation may have been sent, but no user id was returned. Do not retry — check Supabase Auth manually before proceeding.",
      },
      500,
    );
  }

  // The .is("auth_user_id", null) guard repeats the check above at the
  // database level, atomically, so that two concurrent invite calls for
  // the same engineer cannot both succeed — the second one's UPDATE
  // matches zero rows instead of overwriting the first one's link.
  const { data: linkedRows, error: linkError } = await adminClient
    .from("Engineers")
    .update({
      auth_user_id: newAuthUserId,
      email: normalizedEmail,
      login_enabled: true,
    })
    .eq("id", engineerId)
    .is("auth_user_id", null)
    .select("id");

  const linkFailed = !!linkError || !linkedRows || linkedRows.length === 0;

  if (linkFailed) {
    const rollback = await adminClient.auth.admin.deleteUser(newAuthUserId);

    if (rollback.error) {
      console.error("manage-engineer-login: rollback delete of orphaned Auth user failed.");
      return jsonResponse(
        {
          error:
            "Invitation was sent and an Auth account was created, but linking it to the Engineer record failed, and automatic cleanup ALSO failed. This needs manual reconciliation in Supabase — do not retry invite for this engineer until resolved.",
        },
        500,
      );
    }

    if (linkError) {
      return jsonResponse(
        {
          error:
            "Linking the invited account to the Engineer record failed. The invitation was automatically rolled back — safe to retry.",
        },
        500,
      );
    }

    return jsonResponse(
      {
        error:
          "This engineer was linked to a login by another request just now (likely a duplicate submission). The new invitation was automatically rolled back — no action needed.",
      },
      409,
    );
  }

  return jsonResponse({
    ok: true,
    engineer_id: engineerId,
    email: normalizedEmail,
  });
}

async function handleDisable(adminClient: SupabaseClient, engineerId: number) {
  const { data: engineer, error: engineerError } = await adminClient
    .from("Engineers")
    .select("id, auth_user_id")
    .eq("id", engineerId)
    .maybeSingle();

  if (engineerError) {
    console.error("manage-engineer-login: engineer lookup failed during disable.");
    return jsonResponse({ error: "Could not look up engineer." }, 500);
  }

  if (!engineer) {
    return jsonResponse({ error: "Engineer not found." }, 404);
  }

  if (!engineer.auth_user_id) {
    return jsonResponse({ error: "This engineer has no linked login to disable." }, 409);
  }

  // Order matters here, and is chosen so the WORST-case outcome of any
  // failure is always "still can't log in", never a silent access grant:
  // ban first (removes access), Engineers update second. If the update
  // below fails, we roll the ban back (unban) to fully return to the
  // pre-action state rather than leave Auth and the DB disagreeing.
  const { error: banError } = await adminClient.auth.admin.updateUserById(engineer.auth_user_id, {
    ban_duration: "876000h", // effectively indefinite (100 years); there is no permanent-ban primitive
  });

  if (banError) {
    return jsonResponse({ error: "Could not disable login: " + banError.message }, 500);
  }

  const { error: updateError } = await adminClient
    .from("Engineers")
    .update({ login_enabled: false })
    .eq("id", engineerId);

  if (updateError) {
    console.error(
      "manage-engineer-login: Auth ban succeeded but Engineers.login_enabled update failed; rolling back the ban.",
    );

    const rollback = await adminClient.auth.admin.updateUserById(engineer.auth_user_id, {
      ban_duration: "none",
    });

    if (rollback.error) {
      console.error("manage-engineer-login: rollback unban after failed disable-update also failed.");
      return jsonResponse(
        {
          error:
            "The login was disabled in Auth, the Engineer record could not be updated, and automatically restoring the previous state also failed. The account is currently disabled in Auth while the Engineer record still shows it enabled — this needs manual reconciliation in Supabase, but the account cannot log in either way.",
        },
        500,
      );
    }

    return jsonResponse(
      {
        error:
          "Disabling this login failed partway through and was automatically rolled back — the account is unaffected. Safe to retry.",
      },
      500,
    );
  }

  return jsonResponse({ ok: true, engineer_id: engineerId });
}

async function handleReenable(adminClient: SupabaseClient, engineerId: number) {
  const { data: engineer, error: engineerError } = await adminClient
    .from("Engineers")
    .select("id, auth_user_id")
    .eq("id", engineerId)
    .maybeSingle();

  if (engineerError) {
    console.error("manage-engineer-login: engineer lookup failed during reenable.");
    return jsonResponse({ error: "Could not look up engineer." }, 500);
  }

  if (!engineer) {
    return jsonResponse({ error: "Engineer not found." }, 404);
  }

  if (!engineer.auth_user_id) {
    return jsonResponse({ error: "This engineer has no linked login to reenable." }, 409);
  }

  // Order matters here too, and is the REVERSE of disable, for the same
  // reason: Engineers update first, unban (grants access) second. If the
  // unban below fails, we roll the Engineers update back to false so the
  // record can never claim login_enabled = true while the account is
  // actually still banned in Auth — the worst case is still "can't log
  // in", never a silent access grant.
  const { error: updateError } = await adminClient
    .from("Engineers")
    .update({ login_enabled: true })
    .eq("id", engineerId);

  if (updateError) {
    return jsonResponse({ error: "Could not reenable login: " + updateError.message }, 500);
  }

  const { error: unbanError } = await adminClient.auth.admin.updateUserById(engineer.auth_user_id, {
    ban_duration: "none",
  });

  if (unbanError) {
    console.error(
      "manage-engineer-login: Engineers update succeeded but Auth unban failed; rolling back the Engineers update.",
    );

    const rollback = await adminClient
      .from("Engineers")
      .update({ login_enabled: false })
      .eq("id", engineerId);

    if (rollback.error) {
      console.error(
        "manage-engineer-login: rollback of login_enabled after failed reenable-unban also failed.",
      );
      return jsonResponse(
        {
          error:
            "The Engineer record was marked as reenabled, but lifting the Auth ban failed, and automatically restoring the previous state also failed. The Engineer record may now incorrectly show login_enabled = true while the account is still actually banned in Auth — this needs manual reconciliation in Supabase. The account cannot log in either way.",
        },
        500,
      );
    }

    return jsonResponse(
      {
        error:
          "Reenabling this login failed partway through and was automatically rolled back — the account is unaffected. Safe to retry.",
      },
      500,
    );
  }

  return jsonResponse({ ok: true, engineer_id: engineerId });
}
