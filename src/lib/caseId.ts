/**
 * O `case_id` chega pela URL na volta do Stripe e é guardado para sobreviver a
 * um F5. O armazenamento aqui é **conveniência, não dependência**: com cookies
 * e dados de site bloqueados (aba privada agressiva, política corporativa),
 * `localStorage` não apenas falha ao gravar — o próprio acesso lança. Sem esta
 * guarda a landing inteira deixava de renderizar por causa de um `setItem`.
 */
function lerGuardado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento o `case_id` vale só enquanto esta página estiver aberta.
  }
}

export function getCaseIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const caseId = params.get('case_id');
  if (caseId) {
    guardar('case_id', caseId);
    return caseId;
  }
  return lerGuardado('case_id');
}
