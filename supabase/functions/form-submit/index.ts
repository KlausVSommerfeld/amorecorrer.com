// form-submit (patched + n8n dispatch + confirm_dispatch)
// Uses Deno.serve and npm:@supabase/supabase-js@2.x
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.29.0";
const MAX_BODY_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per IP per window
const rateLimits = new Map();
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
function bad(msg, status = 400, headers = {}) {
  return json({
    ok: false,
    error: msg
  }, status, headers);
}
function getAllowedOrigins() {
  const env = Deno.env.get("ORIGIN_WHITELIST") ?? "";
  return env.split(",").map((s)=>s.trim()).filter(Boolean);
}
function originAllowed(origin) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;
  return origin !== null && allowed.includes(origin);
}
function buildCorsHeaders(origin) {
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
function normalizePayload(p) {
  const norm = {
    ...p
  };
  if (typeof norm.email === "string") norm.email = norm.email.trim().toLowerCase();
  const digitsOnly = (v)=>(v || "").toString().replace(/\D/g, "") || null;
  if ("telefone" in norm) norm.telefone = digitsOnly(norm.telefone);
  if ("cpf" in norm) norm.cpf = digitsOnly(norm.cpf);
  if ("cep" in norm) norm.cep = digitsOnly(norm.cep);
  if ("placa" in norm && typeof norm.placa === "string") norm.placa = norm.placa.toUpperCase().replace(/\s+/g, "") || null;
  for (const k of Object.keys(norm)){
    if (typeof norm[k] === "string") norm[k] = norm[k].trim();
  }
  return norm;
}
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(hashBuf)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}
function enforceRateLimit(ip) {
  if (!ip) return;
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, {
      count: 1,
      windowStart: now
    });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) throw new Error("Too many requests");
  rateLimits.set(ip, entry);
}
function hmacSha256Hex(secret, message) {
  // Use Web Crypto HMAC with subtle
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);
  return crypto.subtle.importKey("raw", keyData, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]).then((key)=>crypto.subtle.sign("HMAC", key, msgData)).then((sig)=>Array.from(new Uint8Array(sig)).map((b)=>b.toString(16).padStart(2, "0")).join(""));
}
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  if (req.method !== "POST" || (req.headers.get("content-type") || "").indexOf("application/json") !== 0) {
    return bad("Method/Content-Type not allowed", 405, corsHeaders);
  }
  if (!originAllowed(origin)) {
    return bad("Origin not allowed", 403, corsHeaders);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  try {
    enforceRateLimit(ip);
  } catch  {
    return bad("Rate limit exceeded", 429, corsHeaders);
  }
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return bad("Payload too large", 413, corsHeaders);
  }
  let raw;
  try {
    raw = await req.json();
  } catch (e) {
    return bad("Invalid JSON", 400, corsHeaders);
  }
  const required = [
    "case_id",
    "form_token",
    "nome",
    "email"
  ];
  for (const k of required){
    if (!raw[k]) return bad(`Missing field: ${k}`, 400, corsHeaders);
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Server not configured", 500, corsHeaders);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  const norm = normalizePayload(raw);
  const dupSource = {
    case_id: norm.case_id,
    form_token: norm.form_token,
    nome: norm.nome,
    email: norm.email,
    telefone: norm.telefone ?? null,
    cpf: norm.cpf ?? null,
    renavam: norm.renavam ?? null,
    cnh: norm.cnh ?? null,
    placa: norm.placa ?? null
  };
  const dup_guard = await sha256Hex(JSON.stringify(dupSource));
  try {
    const { data: existingCase, error: caseErr } = await supabase.from("form_submissions").select("case_id,document_status,dup_guard,stripe_session_id,email").eq("case_id", norm.case_id).single();
    if (caseErr) {
      // handle not found vs other errors
      const msg = caseErr.message ?? String(caseErr);
      if (msg.includes("No rows") || caseErr.status === 404) {
        return bad("case_id inválido", 404, corsHeaders);
      } else {
        console.error("DB lookup error:", caseErr);
        return bad("DB error", 500, corsHeaders);
      }
    }
    if (existingCase && [
      "completed",
      "failed"
    ].includes(existingCase.document_status)) {
      return bad("Caso já finalizado", 409, corsHeaders);
    }
    if (existingCase && existingCase.dup_guard === dup_guard) {
      return json({
        ok: true,
        message: "Duplicate submission (no-op)",
        dup_guard
      }, 200, corsHeaders);
    }
    if (norm.stripe_session_id && existingCase && existingCase.stripe_session_id === norm.stripe_session_id) {
      return json({
        ok: true,
        message: "Duplicate submission by stripe_session_id (no-op)"
      }, 200, corsHeaders);
    }
    const updateFields = {
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
      renavam: norm.renavam ?? null,
      cnh: norm.cnh ?? null,
      data_infracao: norm.data_infracao ?? null,
      numero_auto: norm.numero_auto ?? null,
      local_infracao: norm.local_infracao ?? null,
      velocidade_permitida: norm.velocidade_permitida ?? null,
      velocidade_aferida: norm.velocidade_aferida ?? null,
      orgao_autuador: norm.orgao_autuador ?? null,
      artigo_ctb: norm.artigo_ctb ?? null,
      dup_guard,
      stripe_session_id: norm.stripe_session_id ?? null,
      updated_at: new Date().toISOString()
    };
    const { data: updated, error: upsertErr } = await supabase.from("form_submissions").update(updateFields).eq("case_id", norm.case_id).select("*").single();
    if (upsertErr) {
      console.error("DB update error:", upsertErr);
      return bad("DB upsert error", 500, corsHeaders);
    }
    // After successful update, attempt dispatch via RPC
    // RPC returns { dispatch_key } or null
    try {
      const rpcResult = await supabase.rpc("attempt_dispatch", {
        case_id: norm.case_id
      }).single();
      const dispatch_row = rpcResult;
      const dispatch_key = dispatch_row?.dispatch_key ?? null;
      if (dispatch_key) {
        const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
        const N8N_HMAC_SECRET = Deno.env.get("N8N_HMAC_SECRET");
        if (N8N_WEBHOOK_URL) {
          // build minimal payload
          const payload = {
            case_id: norm.case_id,
            email: norm.email,
            dispatch_key
          };
          const idempotencyKey = dispatch_key; // use dispatch_key as idempotency key (or combine with case_id)
          const bodyStr = JSON.stringify(payload);
          // compute signature (may be empty if no secret)
          const sigPromise = N8N_HMAC_SECRET ? hmacSha256Hex(N8N_HMAC_SECRET, bodyStr) : Promise.resolve("");
          // Async POST using EdgeRuntime.waitUntil. After POST finishes, call confirm_dispatch(dispatch_key, success)
          const sendPromise = (async ()=>{
            let success = false;
            try {
              const signature = await sigPromise;
              const headers = {
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
              };
              if (signature) headers["X-Signature"] = signature;
              const res = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers,
                body: bodyStr
              });
              success = res.ok;
              if (!res.ok) {
                const txt = await res.text().catch(()=>"<no body>");
                console.error("n8n webhook non-2xx:", res.status, txt);
              }
            } catch (err) {
              console.error("n8n dispatch error (async):", err);
              success = false;
            } finally{
              // Call confirm_dispatch RPC to mark the dispatch as sent/failed
              try {
                await supabase.rpc("confirm_dispatch", {
                  dispatch_key,
                  success
                });
              } catch (rpcErr) {
                console.error("confirm_dispatch RPC error (async):", rpcErr);
              }
            }
          })();
          // Schedule background work without blocking response
          // @ts-ignore
          EdgeRuntime.waitUntil(sendPromise);
        } else {
          console.warn("N8N_WEBHOOK_URL not configured; skipping dispatch and marking failed");
          // mark as failed immediately because we cannot send
          try {
            await supabase.rpc("confirm_dispatch", {
              dispatch_key,
              success: false
            });
          } catch (rpcErr) {
            console.error("confirm_dispatch RPC error (immediate):", rpcErr);
          }
        }
      }
    } catch (rpcErr) {
      // If attempt_dispatch RPC fails, log and continue — we don't block the user response
      console.error("attempt_dispatch RPC error:", rpcErr);
    }
    return json({
      ok: true,
      form: updated
    }, 200, corsHeaders);
  } catch (e) {
    console.error("Handler error:", e);
    if (e.message === "Too many requests") {
      return bad("Rate limit exceeded", 429, corsHeaders);
    }
    return bad("Internal server error", 500, corsHeaders);
  }
});