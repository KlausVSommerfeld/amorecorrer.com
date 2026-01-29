// form-submit (patched + n8n dispatch + confirm_dispatch)
// Uses Deno.serve and @supabase/supabase-js@2.x
// Import from bare specifier, assuming deno.json imports: "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per IP per window
const rateLimits = new Map();

// CORS headers - permitir todos os domínios
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Client-Info',
};

function json(data: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function bad(msg: string, status = 400, headers = {}) {
  return json({
    ok: false,
    error: msg
  }, status, {
    ...corsHeaders,
    ...headers
  });
}

function getAllowedOrigins() {
  const env = Deno.env.get("ORIGIN_WHITELIST") ?? "";
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

function originAllowed(origin: string | null) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;
  return origin !== null && allowed.includes(origin);
}

function buildCorsHeaders(origin: string | null) {
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Client-Info"
  };
}

function normalizePayload(p: Record<string, unknown>) {
  const norm = { ...p };
  if (typeof norm.email === "string") norm.email = norm.email.trim().toLowerCase();
  
  const digitsOnly = (v: unknown) => (v || "").toString().replace(/\D/g, "") || null;
  if ("telefone" in norm) norm.telefone = digitsOnly(norm.telefone);
  if ("cpf" in norm) norm.cpf = digitsOnly(norm.cpf);
  if ("cep" in norm) norm.cep = digitsOnly(norm.cep);
  if ("placa" in norm && typeof norm.placa === "string")
    norm.placa = norm.placa.toUpperCase().replace(/\s+/g, "") || null;
  
  for (const k of Object.keys(norm)) {
    if (typeof norm[k] === "string") norm[k] = norm[k].trim();
  }
  return norm;
}

function enforceRateLimit(ip: string | null) {
  if (!ip) return;
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) throw new Error("Too many requests");
  rateLimits.set(ip, entry);
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hmacSha256Hex(secret: string, message: string) {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);
  return crypto.subtle
    .importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, msgData))
    .then((sig) =>
      Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
}

function logDispatchError(stage: string, details: Record<string, unknown>) {
  console.error(`[dispatch] ${stage}`, details);
}

function logDispatchInfo(stage: string, details: Record<string, unknown>) {
  console.info(`[dispatch] ${stage}`, details);
}

Deno.serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const origin = req.headers.get("origin");
  const corsHeadersForOrigin = buildCorsHeaders(origin);

  if (
    req.method !== "POST" ||
    (req.headers.get("content-type") || "").indexOf("application/json") !== 0
  ) {
    return bad("Method/Content-Type not allowed", 405, corsHeadersForOrigin);
  }

  if (!originAllowed(origin)) {
    return bad("Origin not allowed", 403, corsHeadersForOrigin);
  }

  // Optional: Validate bearer token for additional security
  // Uncomment to enforce authentication
  /*
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return bad("Missing or invalid Authorization header", 401, corsHeadersForOrigin);
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  // Validate token using Supabase
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Server not configured", 500, corsHeadersForOrigin);
  }
  
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    return bad("Invalid authentication token", 401, corsHeadersForOrigin);
  }
  */

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  try {
    enforceRateLimit(ip);
  } catch {
    return bad("Rate limit exceeded", 429, corsHeadersForOrigin);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return bad("Payload too large", 413, corsHeadersForOrigin);
  }

  let raw;
  try {
    raw = await req.json();
  } catch (_e) {
    return bad("Invalid JSON", 400, corsHeadersForOrigin);
  }

  const required = ["case_id", "form_token", "nome", "email"];
  for (const k of required) {
    if (!raw[k]) return bad(`Missing field: ${k}`, 400, corsHeadersForOrigin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Server not configured", 500, corsHeadersForOrigin);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });

  const norm = normalizePayload(raw);

  try {
    const { data: existingCase, error: caseErr } = await supabase
      .from("form_submissions")
      .select("case_id,document_status,dup_guard,stripe_session_id,email")
      .eq("case_id", norm.case_id)
      .maybeSingle();

    if (caseErr) {
      console.error("DB lookup error:", caseErr);
      return bad("DB error", 500, corsHeadersForOrigin);
    }

    if (!existingCase) {
      // Atualiza stripe_sessions: status = 'complete', payment_at = agora
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("stripe_sessions")
        .update({ status: "complete" })
        .eq("case_id", norm.case_id)
        .select("case_id")
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("Stripe session update error:", sessionErr);
        return bad("DB error", 500, corsHeadersForOrigin);
      }
      if (!sessionRow) {
        return bad("case_id inválido", 404, corsHeadersForOrigin);
      }
    }

    if (existingCase && ["completed", "failed"].includes(existingCase.document_status)) {
      return bad("Caso já finalizado", 409, corsHeadersForOrigin);
    }

    // Calculate dup_guard to detect duplicate submissions
    const dupSource = {
      case_id: norm.case_id,
      form_token: norm.form_token,
      nome: norm.nome,
      email: norm.email,
      telefone: norm.telefone ?? null,
      cpf: norm.cpf ?? null,
      renainf: norm.renainf ?? null,
      cnh: norm.cnh ?? null,
      placa: norm.placa ?? null
    };
    const dup_guard = await sha256Hex(JSON.stringify(dupSource));

    // Check for duplicate by dup_guard
    if (existingCase && existingCase.dup_guard === dup_guard) {
      return json(
        {
          ok: true,
          message: "Duplicate submission (no-op)",
          dup_guard
        },
        200,
        corsHeadersForOrigin
      );
    }

    // Check for duplicate by stripe_session_id
    if (
      norm.stripe_session_id &&
      existingCase &&
      existingCase.stripe_session_id === norm.stripe_session_id
    ) {
      return json(
        {
          ok: true,
          message: "Duplicate submission by stripe_session_id (no-op)"
        },
        200,
        corsHeadersForOrigin
      );
    }

    const updateFields = {
      case_id: norm.case_id,
      form_token: norm.form_token,
      nome: norm.nome,
      email: norm.email,
      telefone: norm.telefone ?? null,
      cpf: norm.cpf ?? null,
      endereco: norm.endereco ?? null,
      cidade: norm.cidade ?? null,
      estado: norm.estado ?? null,
      cep: norm.cep ?? null,
      placa: norm.placa ?? null,
      renainf: norm.renainf ?? null,
      cnh: norm.cnh ?? null,
      data_infracao: norm.data_infracao ?? null,
      numero_auto: norm.numero_auto ?? null,
      notificacao_penalidade: norm.notificacao_penalidade ?? null,
      local_infracao: norm.local_infracao ?? null,
      especie_documento: norm.especie_documento ?? null,
      marca_modelo_especie: norm.marca_modelo_especie ?? null,
      expedida_em: norm.expedida_em ?? null,
      descricao_infracao: norm.descricao_infracao ?? null,
      velocidade_permitida: norm.velocidade_permitida ?? null,
      velocidade_aferida: norm.velocidade_aferida ?? null,
      orgao_autuador: norm.orgao_autuador ?? null,
      artigo_ctb: norm.artigo_ctb ?? null,
      amparo_legal: norm.amparo_legal ?? null,
      justificativa: norm.justificativa ?? null,
      dup_guard,
      stripe_session_id: norm.stripe_session_id ?? null,
      updated_at: new Date().toISOString()
    };

    const { data: updated, error: upsertErr } = await supabase
      .from("form_submissions")
      .upsert(updateFields, { onConflict: "case_id" })
      .select("*")
      .single();

    if (upsertErr) {
      console.error("DB update error:", upsertErr);
      return bad("DB upsert error", 500, corsHeadersForOrigin);
    }

    // After successful update, attempt dispatch via RPC
    try {
      const rpcResult = await supabase
        .rpc("attempt_dispatch", {
          case_id: norm.case_id
        })
        .single();

      const dispatch_row = rpcResult.data as { dispatch_key?: string } | null;
      const dispatch_key = dispatch_row?.dispatch_key ?? null;

      if (dispatch_key) {
        logDispatchInfo("dispatch_iniciado", {
          case_id: norm.case_id,
          dispatch_key
        });

        const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
        const N8N_HMAC_SECRET = Deno.env.get("N8N_HMAC_SECRET");

        if (N8N_WEBHOOK_URL) {
          const payload = {
            case_id: norm.case_id,
            email: norm.email,
            dispatch_key
          };
          const idempotencyKey = dispatch_key;
          const bodyStr = JSON.stringify(payload);

          const sigPromise = N8N_HMAC_SECRET
            ? hmacSha256Hex(N8N_HMAC_SECRET, bodyStr)
            : Promise.resolve("");

          let success = false;
          try {
            const signature = await sigPromise;

            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey
            };
            if (signature) headers["X-Signature"] = signature;

            const dispatchSentAt = new Date().toISOString();
            const res = await fetch(N8N_WEBHOOK_URL, {
              method: "POST",
              headers,
              body: bodyStr
            });
            success = res.ok;
            if (res.ok) {
              const { error: statusErr } = await supabase
                .from("form_submissions")
                .update({
                  document_status: "generating",
                  updated_at: dispatchSentAt
                })
                .eq("case_id", norm.case_id);

              if (statusErr) {
                console.error("Failed to update document_status after n8n dispatch:", statusErr);
              }
            }
            if (!res.ok) {
              const txt = await res.text().catch(() => "<no body>");
              logDispatchError("n8n_webhook_non_2xx", {
                case_id: norm.case_id,
                dispatch_key,
                status: res.status,
                body: txt
              });
            }
          } catch (err) {
            logDispatchError("n8n_dispatch_error", {
              case_id: norm.case_id,
              dispatch_key,
              error: err instanceof Error ? err.message : String(err)
            });
            success = false;
          } finally {
            try {
              await supabase.rpc("confirm_dispatch", {
                dispatch_key,
                success
              });
            } catch (rpcErr) {
              logDispatchError("confirm_dispatch_rpc_error", {
                case_id: norm.case_id,
                dispatch_key,
                error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
              });
            }
          }
        } else {
          logDispatchError("n8n_webhook_url_missing", {
            case_id: norm.case_id,
            dispatch_key
          });
          try {
            await supabase.rpc("confirm_dispatch", {
              dispatch_key,
              success: false
            });
          } catch (rpcErr) {
            logDispatchError("confirm_dispatch_rpc_error", {
              case_id: norm.case_id,
              dispatch_key,
              error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
            });
          }
        }
      } else {
        const missing: string[] = [];
        let document_status: string | null = null;
        let stripe_session_id: string | null = null;
        let payment_status: string | null = null;

        const { data: formRowData, error: formErr } = await supabase
          .from("form_submissions")
          .select("document_status,stripe_session_id")
          .eq("case_id", norm.case_id)
          .maybeSingle();

        if (formErr) {
          logDispatchError("dispatch_status_lookup_error", {
            case_id: norm.case_id,
            error: formErr instanceof Error ? formErr.message : String(formErr)
          });
          missing.push("form_submissions_lookup_error");
        }

        const formRow = formRowData as {
          document_status?: string | null;
          stripe_session_id?: string | null;
        } | null;

        if (!formRow) {
          missing.push("form_submissions");
        } else {
          document_status = formRow.document_status ?? null;
          stripe_session_id = formRow.stripe_session_id ?? null;

          if (document_status !== "pending") {
            missing.push("form_submissions.document_status=pending");
          }

          if (!stripe_session_id) {
            missing.push("form_submissions.stripe_session_id");
          } else {
            const { data: stripeRowData, error: stripeErr } = await supabase
              .from("stripe_sessions")
              .select("payment_status")
              .eq("id", stripe_session_id)
              .maybeSingle();

            if (stripeErr) {
              logDispatchError("dispatch_status_lookup_error", {
                case_id: norm.case_id,
                stripe_session_id,
                error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr)
              });
              missing.push("stripe_sessions_lookup_error");
            }

            const stripeRow = stripeRowData as { payment_status?: string | null } | null;
            if (!stripeRow) {
              missing.push("stripe_sessions");
            } else {
              payment_status = stripeRow.payment_status ?? null;
              if (payment_status !== "paid") {
                missing.push("stripe_sessions.payment_status=paid");
              }
            }
          }
        }

        if (missing.length === 0) {
          missing.push("dispatch_precondition_unknown");
        }

        logDispatchInfo("dispatch_ignorado", {
          case_id: norm.case_id,
          missing,
          document_status,
          stripe_session_id,
          payment_status
        });
      }
    } catch (rpcErr) {
      logDispatchError("attempt_dispatch_rpc_error", {
        case_id: norm.case_id,
        error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
      });
    }

    return json(
      {
        ok: true,
        form: updated
      },
      200,
      corsHeadersForOrigin
    );
  } catch (_e) {
    console.error("Handler error:", _e);
    if (_e instanceof Error && _e.message === "Too many requests") {
      return bad("Rate limit exceeded", 429, corsHeadersForOrigin);
    }
    return bad("Internal server error", 500, corsHeadersForOrigin);
  }
});
