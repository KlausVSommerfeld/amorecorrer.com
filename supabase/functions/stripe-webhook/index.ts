import Stripe from "npm:stripe@12.16.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_TOKEN = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? ""; // optional, previously used
const N8N_HMAC_SECRET = Deno.env.get("N8N_HMAC_SECRET") ?? ""; // new: used to sign payload HMAC

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-08-16"
});

/** Map Stripe event + session fields to local status.
 * Returns null for non-decisive events.
 */
function mapStripeToLocalStatus(eventType: string, session: any): string | null {
  if (eventType === "checkout.session.completed") return "paid";
  if (eventType === "checkout.session.async_payment_succeeded") return "paid";
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  if (eventType === "checkout.session.expired") return "cancelled";
  if (eventType === "checkout.session.updated") {
    const s = session?.payment_status ?? session?.status ?? null;
    if (s === "paid") return "paid";
  }
  return null;
}

/** Promotion guard to avoid overwriting higher states with weaker ones. */
function shouldPromoteStatus(current: string | null, next: string): boolean {
  if (!current) return true;
  const rank: Record<string, number> = {
    pending: 1,
    failed: 2,
    cancelled: 2,
    paid: 3
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}

/** Simple HMAC header for n8n webhook authentication (if secret present) */
async function computeHmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  const b = new Uint8Array(sig);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** POST helper with basic retry (2 attempts) */
async function postWithRetry(url: string, body: any, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; text: string }> {
  const payload = JSON.stringify(body);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: payload
      });
      if (res.ok) return {
        ok: true,
        status: res.status,
        text: await res.text()
      };
      const txt = await res.text();
      console.warn(`n8n webhook returned ${res.status}: ${txt}`);
      if (res.status >= 400 && res.status < 500) return {
        ok: false,
        status: res.status,
        text: txt
      }; // don't retry client errors
    } catch (err) {
      console.warn("n8n webhook attempt failed:", err);
      if (attempt === 2) return {
        ok: false,
        status: 0,
        text: String(err)
      };
      // small backoff
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return {
    ok: false,
    status: 0,
    text: "Retries exhausted"
  };
}

/**
 * Call Supabase REST RPC /rpc/attempt_dispatch with case_id.
 * Returns parsed JSON or null on non-ok.
 */
async function callAttemptDispatch(case_id: string): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rpc/attempt_dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ case_id })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("attempt_dispatch RPC failed:", res.status, txt);
      return null;
    }
    // RPC may return object or array depending on implementation; handle both
    const json = await res.json();
    if (Array.isArray(json)) return json[0] ?? null;
    return json;
  } catch (err) {
    console.error("Error calling attempt_dispatch:", err);
    return null;
  }
}

/** Upsert stripe_sessions via Supabase REST and optionally update form_submissions.
 * When attempt_dispatch returns a dispatch_key, schedule n8n call via EdgeRuntime.waitUntil.
 */
async function handleSessionUpsertAndFormUpdate(
  event: any,
  session: any,
  statusToApply: string | null
): Promise<void> {
  const case_id = session.client_reference_id ?? session.metadata?.case_id ?? null;

  const payloadSession = {
    id: session.id,
    case_id,
    status: session.payment_status ?? session.status ?? null,
    url: session.url ?? null,
    metadata: session.metadata ?? null,
    event_payload: event,
    created_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  // Upsert stripe_sessions (idempotent)
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/stripe_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify([payloadSession])
  });

  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    console.error("Failed to upsert stripe_sessions:", upsertRes.status, text);
    throw new Error("Failed to upsert stripe_sessions");
  }

  // If no case_id, cannot link to form_submissions — return (still ok)
  if (!case_id) {
    console.warn("No case_id found on session", session.id);
    return;
  }

  // Fetch existing form_submissions entry to inspect current payment_status and id
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/form_submissions?case_id=eq.${encodeURIComponent(case_id)}&select=id,case_id,payment_status,stripe_session_id,email`,
    {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Accept: "application/json"
      }
    }
  );

  if (!getRes.ok) {
    const text = await getRes.text();
    console.error("Failed to fetch form_submissions:", getRes.status, text);
    throw new Error("Failed to fetch form_submissions");
  }

  const arr = await getRes.json();
  const existing = arr?.[0] ?? null;
  const currentStatus = existing?.payment_status ?? null;

  // Build patch object
  const patchBody: any = {
    stripe_session_id: session.id,
    updated_at: new Date().toISOString()
  };

  let promotedToPaid = false;
  if (statusToApply && shouldPromoteStatus(currentStatus, statusToApply)) {
    patchBody.payment_status = statusToApply;
    if (statusToApply === "paid" && currentStatus !== "paid") promotedToPaid = true;
  }

  // PATCH the matching form_submissions row (idempotent)
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/form_submissions?case_id=eq.${encodeURIComponent(case_id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(patchBody)
    }
  );

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error("Failed to patch form_submissions:", patchRes.status, text);
    throw new Error("Failed to patch form_submissions");
  }

  // NEW: call attempt_dispatch RPC. It will return { dispatch_key } when the pair (payment + form) is ready and not yet dispatched.
  try {
    const rpcResp = await callAttemptDispatch(case_id);
    if (!rpcResp) {
      // RPC failed or returned nothing — do not dispatch
      console.warn("attempt_dispatch returned no result or failed for case_id:", case_id);
      return;
    }

    const dispatch_key = rpcResp?.dispatch_key ?? null;
    if (!dispatch_key) {
      // RPC indicates no dispatch required at this time
      console.log("attempt_dispatch indicated no dispatch needed for case_id:", case_id);
      return;
    }

    // If we have dispatch_key, prepare payload and headers for n8n
    if (!N8N_WEBHOOK_URL) {
      console.error("N8N_WEBHOOK_URL not configured; cannot dispatch");
      return;
    }

    // Use the existing fetched 'existing' submission if present; if not, try to fetch again to get id/email
    let submission = existing;
    if (!submission) {
      // Try to fetch representation from patch (Prefer=return=representation) above could have returned the row,
      // but to keep logic simple, fetch again:
      const reget = await fetch(
        `${SUPABASE_URL}/rest/v1/form_submissions?case_id=eq.${encodeURIComponent(case_id)}&select=id,case_id,email`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Accept: "application/json"
          }
        }
      );
      if (reget.ok) {
        const a = await reget.json();
        submission = a?.[0] ?? null;
      }
    }

    const n8nPayload = {
      case_id: submission?.case_id ?? case_id,
      submission_id: submission?.id ?? null,
      stripe_session_id: session.id,
      email: submission?.email ?? null,
      dispatch_key,
      timestamp: new Date().toISOString()
    };

    // Prepare headers: Idempotency-Key + HMAC signature using N8N_HMAC_SECRET
    const headers: Record<string, string> = {
      "Idempotency-Key": dispatch_key
    };

    if (N8N_HMAC_SECRET) {
      try {
        const hmac = await computeHmac(JSON.stringify(n8nPayload), N8N_HMAC_SECRET);
        headers["x-n8n-signature"] = hmac;
      } catch (err) {
        console.error("Failed to compute HMAC for n8n payload:", err);
        // continue without signature if HMAC computation fails — but log
      }
    } else if (N8N_WEBHOOK_TOKEN) {
      // Backwards-compatible: if N8N_HMAC_SECRET not present but old token exists, optionally include token HMAC
      try {
        const hmac = await computeHmac(JSON.stringify(n8nPayload), N8N_WEBHOOK_TOKEN);
        headers["x-n8n-signature"] = hmac;
      } catch (err) {
        // ignore
      }
    }

    // Fire-and-forget via background execution, using existing postWithRetry helper
    const p = (async () => {
      try {
        const res = await postWithRetry(N8N_WEBHOOK_URL, n8nPayload, headers);
        if (!res.ok) {
          console.error("n8n delivery failed:", res);
          // Optionally, call another RPC to record failure or write to a table (not implemented here)
        } else {
          console.log("n8n delivery succeeded:", res.status);
        }
      } catch (err) {
        console.error("Unexpected error delivering to n8n:", err);
      }
    })();

    globalThis.EdgeRuntime?.waitUntil?.(p);
  } catch (err) {
    console.error("Error during attempt_dispatch/dispatch flow:", err);
    // Do not throw — function should continue and return success to Stripe if processing completed
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const buf = await req.arrayBuffer();
    const rawBody = new Uint8Array(buf);
    const sig = req.headers.get("stripe-signature") ?? "";

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    const relevantEvents = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.updated",
      "checkout.session.expired"
    ]);

    if (!relevantEvents.has(event.type)) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const session = event.data.object ?? {};
    const statusToApply = mapStripeToLocalStatus(event.type, session);

    try {
      await handleSessionUpsertAndFormUpdate(event, session, statusToApply);
    } catch (err) {
      console.error("Error processing session:", err);
      return new Response("Internal Server Error", { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Unexpected error handling webhook:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
