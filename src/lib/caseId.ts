export function getCaseIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const caseId = params.get("case_id");
  if (caseId) localStorage.setItem("case_id", caseId);
  return caseId || localStorage.getItem("case_id");
}
