import Stripe from "npm:stripe@12.16.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-08-16" });

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

function shouldPromoteStatus(current: string | null, next: string): boolean {
  if (!current) return true;
  const rank: Record<string, number> = {
    pending: 1,
    failed: 2,
    cancelled: 2,
    paid: 3,
    refunded: 3,
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}

async function triggerDispatch(case_id: string): Promise<void> {
  const attempts = [
    { label: "p_case_id", args: { p_case_id: case_id } },
    { label: "case_id",   args: { case_id } },
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabaseAdmin.rpc("attempt_dispatch", attempt.args);

    if (error) {
      console.warn(`[webhook] attempt_dispatch(${attempt.label}) falhou:`, error.message);
      continue;
    }

    console.info("[webhook] attempt_dispatch concluído", {
      case_id,
      param: attempt.label,
      result: data,
    });
    return;
  }

  console.error("[webhook] attempt_dispatch: todas as tentativas falharam", { case_id });
}

async function handleSessionUpsertAndFormUpdate(
  event: any,
  session: any,
  statusToApply: string | null
): Promise<{ paymentConfirmed: boolean; case_id: string | null }> {
  const case_id = session.client_reference_id ?? session.metadata?.case_id ?? null;

  // Guard: sessão sem case_id não pode ser persistida (coluna NOT NULL).
  if (!case_id) {
    console.warn("[webhook] Sessão ignorada: case_id ausente", {
      session_id: session.id,
      event_type: event.type,
    });
    return { paymentConfirmed: false, case_id: null };
  }

  // Determina o status a promover
  let nextPaymentStatus: string | null = null;
  let nextPaymentAt: string | null = null;

  const sessionCreatedAt = new Date(
    (session.created ?? Math.floor(Date.now() / 1000)) * 1000
  ).toISOString();

  // ── SELECT: verifica se já existe linha para este case_id ──────────────────
  // Estratégia: INSERT se não existe, PATCH seletivo se existe.
  // Nunca alteramos o `id` de uma linha existente — preserva a FK
  // dispatches.stripe_session_id → stripe_sessions.id.
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/stripe_sessions?case_id=eq.${encodeURIComponent(case_id)}&select=id,payment_status,payment_at&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Accept: "application/json",
      },
    }
  );
  const existingArr = existingRes.ok ? await existingRes.json() : [];
  const existingRow: { id: string; payment_status: string | null; payment_at: string | null } | null =
    existingArr?.[0] ?? null;

  // Calcula promoção de status com base na linha existente (ou null se nova)
  if (statusToApply) {
    const currentStatus = existingRow?.payment_status ?? null;
    const currentPaymentAt = existingRow?.payment_at ?? null;
    if (shouldPromoteStatus(currentStatus, statusToApply)) {
      nextPaymentStatus = statusToApply;
      if (statusToApply === "paid" && !currentPaymentAt) {
        const ts =
          typeof event?.created === "number"
            ? event.created
            : typeof session?.created === "number"
            ? session.created
            : Math.floor(Date.now() / 1000);
        nextPaymentAt = new Date(ts * 1000).toISOString();
      }
    }
  }

  if (!existingRow) {
    // ── INSERT: primeira vez que este case_id aparece ─────────────────────────
    const insertPayload: Record<string, unknown> = {
      id: session.id,
      case_id,
      status: session.payment_status ?? session.status ?? null,
      ...(nextPaymentStatus ? { payment_status: nextPaymentStatus } : {}),
      ...(nextPaymentAt    ? { payment_at: nextPaymentAt }         : {}),
      metadata: session.metadata ?? null,
      event_payload: event,
      created_at: sessionCreatedAt,
    };
    if (typeof session.url === "string" && session.url.length > 0) {
      insertPayload.url = session.url;
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/stripe_sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([insertPayload]),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      console.error("Failed to insert stripe_sessions:", insertRes.status, text);
      throw new Error("Failed to insert stripe_sessions");
    }
  } else {
    // ── PATCH: linha já existe — atualiza só campos de pagamento, NUNCA o id ──
    if (nextPaymentStatus) {
      const patchPayload: Record<string, unknown> = {
        status: session.payment_status ?? session.status ?? null,
        payment_status: nextPaymentStatus,
        metadata: session.metadata ?? null,
        event_payload: event,
        ...(nextPaymentAt ? { payment_at: nextPaymentAt } : {}),
      };

      const patchSessionRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stripe_sessions?case_id=eq.${encodeURIComponent(case_id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(patchPayload),
        }
      );

      if (!patchSessionRes.ok) {
        const text = await patchSessionRes.text();
        console.error("Failed to patch stripe_sessions:", patchSessionRes.status, text);
        throw new Error("Failed to patch stripe_sessions");
      }
    } else {
      console.info("[webhook] stripe_sessions não atualizada: promoção desnecessária", {
        case_id,
        current: existingRow.payment_status,
        attempted: statusToApply,
      });
    }
  }

  // Atualiza link em form_submissions (stripe_session_id aponta para o id ORIGINAL preservado)
  const sessionIdToLink = existingRow?.id ?? session.id;
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/form_submissions?case_id=eq.${encodeURIComponent(case_id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        stripe_session_id: sessionIdToLink,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error("Failed to patch form_submissions:", patchRes.status, text);
    throw new Error("Failed to patch form_submissions");
  }

  const paymentConfirmed = nextPaymentStatus === "paid";
  return { paymentConfirmed, case_id };
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

    let paymentConfirmed = false;
    let case_id: string | null = null;

    try {
      ({ paymentConfirmed, case_id } = await handleSessionUpsertAndFormUpdate(
        event,
        session,
        statusToApply
      ));
    } catch (err) {
      console.error("Error processing session:", err);
      return new Response("Internal Server Error", { status: 500 });
    }

    if (paymentConfirmed && case_id) {
      console.info("[webhook] Pagamento confirmado — disparando attempt_dispatch", { case_id });
      await triggerDispatch(case_id);
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