import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCaseIdFromUrl } from "@/lib/caseId";
import PageShell from "../components/PageShell";

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
    <PageShell>
      <div className="container">
        <div className="page__head">
          <span className="eyebrow">Checkout interrompido</span>
          <h1 className="page__title">Pagamento cancelado.</h1>
          <p className="max-w-[56ch] text-muted-foreground">
            Nenhuma cobrança foi feita. Você volta para a página inicial em
            instantes — ou agora, pelo botão abaixo.
          </p>
        </div>

        {caseIdFromParams ? (
          <dl className="mb-8 max-w-md">
            <div className="field border-y border-rule">
              <dt className="field__label">Número do caso</dt>
              <dd className="field__value break-all">{caseIdFromParams}</dd>
            </div>
          </dl>
        ) : null}

        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn btn--solid"
          >
            Voltar agora
          </button>
          <span className="note">Redirecionando em 3 segundos</span>
        </div>
      </div>
    </PageShell>
  );
};

export default Cancel;
