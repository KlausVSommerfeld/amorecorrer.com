"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AnalyticsPayload = Record<string, unknown>;

function logCancelAnalytics(caseId: string | null) {
  const payload: AnalyticsPayload = caseId ? { case_id: caseId } : {};
  const w = typeof window === "undefined" ? undefined : (window as Record<string, any>);

  if (!w) return;

  if (w.analytics?.track) {
    w.analytics.track("checkout_cancelled", payload);
    return;
  }

  if (typeof w.gtag === "function") {
    w.gtag("event", "checkout_cancelled", payload);
    return;
  }

  if (Array.isArray(w.dataLayer)) {
    w.dataLayer.push({ event: "checkout_cancelled", ...payload });
    return;
  }

  console.info("[analytics] checkout_cancelled", payload);
}

export default function CancelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseId = searchParams.get("case_id");

  useEffect(() => {
    if (caseId) {
      try {
        localStorage.setItem("case_id", caseId);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
    }
    logCancelAnalytics(caseId);
  }, [caseId]);

  useEffect(() => {
    const timer = setTimeout(() => router.push("/"), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-accent/20 px-4">
      <div className="container">
        <div className="max-w-2xl mx-auto bg-card text-foreground rounded-2xl shadow-lg border border-border p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <h1 className="text-3xl font-bold">Pagamento cancelado</h1>
          <p className="text-muted-foreground">
            Nenhuma cobranca foi realizada. Voce sera redirecionado para a pagina inicial em instantes.
          </p>
          {caseId ? (
            <p className="text-sm text-muted-foreground">
              ID do caso: <span className="font-semibold text-foreground">{caseId}</span>
            </p>
          ) : null}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="btn-primary px-6 py-3"
            >
              Voltar agora
            </button>
            <div className="text-sm text-muted-foreground">
              Redirecionando em 3s...
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
