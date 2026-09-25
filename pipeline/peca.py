"""Do rascunho do DeepSeek ao texto que vai para o PDF.

Puro, sem dependências: testável com unittest fora do venv de Windows.

O prompt pede texto puro, sem prefácio, sem notas e sem fecho — mas o modelo
escorrega, e o que ele escreve vai direto ao PDF do cliente. Numa rodada real
(25/09/2026, caso completo), duas de três peças vieram com `**negrito**` e `---`
impressos, e as três assinaram com a data de expedição da notificação como se
fosse a data do protocolo. Aqui a forma é garantida por código:

- o markdown que escapar é removido;
- tudo depois do "pede deferimento" (local, data, assinatura, "Observação…")
  é cortado, e o fecho é montado a partir dos dados do caso, com a data SEMPRE
  em branco — ela é o dia em que o cliente protocolar;
- no PDF, `\\n` vira quebra de linha (o reportlab juntaria tudo numa linha só).
"""

from __future__ import annotations

import html
import re
from typing import Any

LINHA_EM_BRANCO = "______________________"

_PEDIDO = re.compile(r"\b(pede|requer|espera|aguarda|peço)\s+deferimento\b[^\n]*", re.IGNORECASE)
_NOTA = re.compile(r"^[*_\s]*(observa[çc][ãa]o|obs\.?|nota)\b", re.IGNORECASE)
_PREFACIO = re.compile(
    r"^(com base nos dados|segue|abaixo|a seguir|conforme solicitado)\b", re.IGNORECASE
)


def limpar_markdown(texto: str) -> str:
    # Separadores primeiro: depois do negrito, "***" já teria virado "*".
    t = re.sub(r"(?m)^[ \t]*([-*])(?:[ \t]*\1){2,}[ \t]*$", "", texto)
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = t.replace("**", "")
    # `__negrito__`, mas não a linha em branco "________" que o prompt pede.
    t = re.sub(r"__([^_\n](?:[^\n]*?[^_\n])?)__", r"\1", t)
    t = re.sub(r"(?m)^[ \t]{0,3}#{1,6}[ \t]+", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def remover_prefacio(texto: str) -> str:
    """Tira o "Com base nos dados informados, apresento o rascunho:" do início."""
    primeiro, _, resto = texto.partition("\n\n")
    conversa = _PREFACIO.match(primeiro.strip()) and len(primeiro) < 300 and any(
        p in primeiro.lower() for p in ("rascunho", "recurso", "peça", "defesa")
    )
    return resto.strip() if conversa and resto.strip() else texto


def cortar_depois_do_pedido(texto: str) -> str:
    m = _PEDIDO.search(texto)
    if m:
        texto = texto[: m.end()]
    # Sem pedido (ou antes dele), notas ao cliente no fim também saem.
    paragrafos = [p for p in texto.split("\n\n")]
    while paragrafos and _NOTA.match(paragrafos[-1]):
        paragrafos.pop()
    return "\n\n".join(paragrafos).strip()


def _cpf(valor: Any) -> str:
    digitos = re.sub(r"\D", "", str(valor or ""))
    if len(digitos) == 11:
        return f"{digitos[:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:]}"
    return str(valor).strip() if valor else "______________"


def fecho(case: dict[str, Any]) -> str:
    cidade = str(case.get("cidade") or "").strip()
    uf = str(case.get("estado") or "").strip().upper()
    local = f"{cidade}/{uf}" if cidade and uf else (cidade or LINHA_EM_BRANCO)
    nome = str(case.get("nome") or "").strip() or LINHA_EM_BRANCO
    return (
        f"{local}, ____ de ______________ de ________.\n\n"
        "______________________________\n"
        f"{nome}\n"
        f"CPF {_cpf(case.get('cpf'))}"
    )


def texto_da_peca(rascunho: str, case: dict[str, Any]) -> str:
    t = limpar_markdown(rascunho)
    t = remover_prefacio(t)
    t = cortar_depois_do_pedido(t)
    return f"{t}\n\n{fecho(case)}"


def paragrafo_para_pdf(texto: str) -> str:
    return html.escape(texto.strip()).replace("\n", "<br/>")
