import Stripe from "npm:stripe@13.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.31.0";
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY env var");
  throw new Error("Missing STRIPE_SECRET_KEY");
}
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  throw new Error("Missing Supabase environment variables");
}
const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20"
});
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});
Deno.serve(async (req)=>{
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        error: "Method not allowed"
      }), {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({
        error: "Expected application/json"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const body = await req.json().catch(()=>null);
    if (!body) {
      return new Response(JSON.stringify({
        error: "Invalid JSON"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // CRITICAL CHANGE: generate case_id server-side for control, uniqueness, traceability
    const case_id = crypto.randomUUID();
    const origin = new URL(req.url).origin;
    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: case_id,
      payment_method_types: [
        "card"
      ],
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: 1999,
            product_data: {
              name: "Recurso de multa",
              description: "Petição em PDF gerada automaticamente"
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        case_id
      },
      success_url: `${origin}/form?success=true&case_id=${encodeURIComponent(case_id)}`,
      cancel_url: `${origin}/?cancel=true`
    });
    // Persist session to Supabase
    const insertPayload = {
      id: session.id,
      case_id: case_id,
      status: session.status || "created",
      url: session.url || null,
      metadata: session.metadata || {}
    };
    try {
      const { error: dbError } = await supabase.from("stripe_sessions").insert(insertPayload).select();
      if (dbError) {
        console.error("Failed to persist stripe session:", dbError.message);
      // Do not fail the flow for DB insert error; return session to client but surface log.
      }
    } catch (e) {
      console.error("Unexpected DB error while inserting stripe session:", e instanceof Error ? e.message : String(e));
    }
    return new Response(JSON.stringify({
      url: session.url,
      id: session.id,
      case_id
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Erro creating checkout session:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({
      error: "Falha ao criar sessão"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});