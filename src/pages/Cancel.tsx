import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCaseIdFromUrl } from "@/lib/caseId";

type AnalyticsPayload = Record<string, unknown>;

function logCancelAnalytics(caseId: string | null) {
  const payload: AnalyticsPayload = caseId ? { case_id: caseId } : {};
  type GtagEvent = (
    event: string,
    action: string,
    params?: Record<string, unknown>
  ) => void;
  type AnalyticsWindow = typeof window & {
    analytics?: {
      track?: (event: string, payload?: AnalyticsPayload) => void;
    };
    gtag?: GtagEvent;
    dataLayer?: unknown[];
  };
  const w = typeof window === "undefined" ? undefined : (window as AnalyticsWindow);

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

const Cancel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseIdFromParams = searchParams.get("case_id");

  useEffect(() => {
    const storedCaseId = getCaseIdFromUrl() || caseIdFromParams;
    logCancelAnalytics(storedCaseId);
  }, [caseIdFromParams]);

  useEffect(() => {
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

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
          {caseIdFromParams ? (
            <p className="text-sm text-muted-foreground">
              ID do caso: <span className="font-semibold text-foreground">{caseIdFromParams}</span>
            </p>
          ) : null}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate("/")}
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
};

export default Cancel;
