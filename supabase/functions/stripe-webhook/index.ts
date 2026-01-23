import Stripe from "npm:stripe@12.16.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-08-16" });

/** Map Stripe event + session fields to local decisive status.
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
    paid: 3,
    refunded: 3, // se você usar no futuro
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}

/**
 * Read existing stripe_sessions.payment_status/payment_at for a given session id.
 * Returns current values or nulls if not found / failed.
 */
async function getCurrentStripePaymentState(
  sessionId: string
): Promise<{ payment_status: string | null; payment_at: string | null }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/stripe_sessions?id=eq.${encodeURIComponent(sessionId)}&select=payment_status,payment_at`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) {
      return { payment_status: null, payment_at: null };
    }
    const arr = await res.json();
    return {
      payment_status: arr?.[0]?.payment_status ?? null,
      payment_at: arr?.[0]?.payment_at ?? null,
    };
  } catch {
    return { payment_status: null, payment_at: null };
  }
}

/** Upsert stripe_sessions via Supabase REST and update form_submissions linkage (no payment_status in form_submissions). */
async function handleSessionUpsertAndFormUpdate(
  event: any,
  session: any,
  statusToApply: string | null
): Promise<void> {
  const case_id = session.client_reference_id ?? session.metadata?.case_id ?? null;

  // Decide what to write into stripe_sessions.payment_status/payment_at, without demoting
  let nextPaymentStatus: string | null = null;
  let nextPaymentAt: string | null = null;
  if (statusToApply) {
    const current = await getCurrentStripePaymentState(session.id);
    if (shouldPromoteStatus(current.payment_status, statusToApply)) {
      nextPaymentStatus = statusToApply;
      if (statusToApply === "paid" && !current.payment_at) {
        const ts = typeof event?.created === "number"
          ? event.created
          : (typeof session?.created === "number" ? session.created : Math.floor(Date.now() / 1000));
        nextPaymentAt = new Date(ts * 1000).toISOString();
      }
    } else {
      nextPaymentStatus = null; // keep existing
    }
  }

  const payloadSession: Record<string, unknown> = {
    id: session.id,
    case_id,
    // "status" = raw stripe status snapshot for visibility
    status: session.payment_status ?? session.status ?? null,
    // "payment_status" = decisive local status driven by events (paid/failed/cancelled)
    ...(nextPaymentStatus ? { payment_status: nextPaymentStatus } : {}),
    ...(nextPaymentAt ? { payment_at: nextPaymentAt } : {}),
    metadata: session.metadata ?? null,
    event_payload: event,
    created_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };
  if (typeof session.url === "string" && session.url.length > 0) {
    payloadSession.url = session.url;
  }

  // Upsert stripe_sessions (idempotent)
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/stripe_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([payloadSession]),
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

  // Update link on form_submissions (NO payment_status column here)
  const patchBody = {
    stripe_session_id: session.id,
    updated_at: new Date().toISOString(),
  };

  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/form_submissions?case_id=eq.${encodeURIComponent(case_id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patchBody),
    }
  );

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error("Failed to patch form_submissions:", patchRes.status, text);
    throw new Error("Failed to patch form_submissions");
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
      // CHANGE #1: async verification for Deno SubtleCrypto provider
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    const relevantEvents = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.updated",
      "checkout.session.expired",
    ]);

    if (!relevantEvents.has(event.type)) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error handling webhook:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
