"""Do rascunho do DeepSeek ao texto que vai para o PDF.

Puro, sem dependências: testável com unittest fora do venv de Windows.

O prompt pede texto puro, sem prefácio, sem notas e sem fecho — mas o modelo
escorrega, e o que ele escreve vai direto ao PDF do cliente. Numa rodada real
(25/09/2026, caso completo), duas de três peças vieram com `**negrito**` e `---`
impressos, e as três assinaram com a data de expedição da notificação como se
fosse a data do protocolo. Aqui a forma é garantida por código:

- o markdown que escapar é removido;
- o endereçamento é do código, pelo estágio do formulário: o modelo, sem saber a
  quem cada estágio se dirige, endereçou uma defesa prévia à JARI (25/09/2026); o
  que ele escrever de vocativo é trocado pelo `enderecamento()`;
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
LINHA_CURTA = "__________"  # no quadro de campos: a linha longa não cabe na célula
ABERTURA_PEDIDO = "Diante do exposto, requer:"
_ADVERTENCIA = (
    "subsidiariamente, não havendo outra infração cometida nos últimos 12 (doze) meses, a "
    "aplicação da penalidade de advertência por escrito em substituição à multa, nos termos "
    "do art. 267 do CTB"
)

_PEDIDO = re.compile(r"\b(pede|requer|espera|aguarda|peço)\s+deferimento\b[^\n]*", re.IGNORECASE)
_NOTA = re.compile(r"^[*_\s]*(observa[çc][ãa]o|obs\.?|nota)\b", re.IGNORECASE)
# Os dois valores que o formulário grava em `especie_documento` (Form.tsx, ESTAGIOS).
DEFESA_PREVIA = "Notificação de autuação — defesa prévia"
RECURSO_JARI = "Notificação de penalidade — recurso à JARI"
# Título na peça, nome no metadado do PDF, prefixo do arquivo.
_NOMES = {
    DEFESA_PREVIA: ("DEFESA PRÉVIA", "Defesa prévia", "defesa-previa"),
    RECURSO_JARI: ("RECURSO À JARI", "Recurso à JARI", "recurso-jari"),
}
_DATA = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?")
_VOCATIVO = re.compile(
    r"^(excelent[ií]ssim|ilustr[ií]ssim|exm[oa]s?\b|ilm[oa]s?\b|senhora?\b|sra?\.|"
    r"presidente\b|à\s|às\s|ao\s|aos\s)",
    re.IGNORECASE,
)
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


def remover_enderecamento(texto: str) -> str:
    """Tira as linhas de vocativo que o modelo puser no início ("Excelentíssimo…",
    "À CET-RIO…"). Só linhas curtas: um parágrafo que começa por "Ao" é corpo."""
    linhas = texto.strip().split("\n")
    while linhas and len(linhas[0]) <= 200 and _VOCATIVO.match(linhas[0].strip()):
        linhas.pop(0)
        while linhas and not linhas[0].strip():
            linhas.pop(0)
    return "\n".join(linhas).strip()


def enderecamento(case: dict[str, Any]) -> str:
    """Defesa prévia: a autoridade que julga a autuação (CTB, art. 281). Recurso: a
    JARI (art. 285, § 2º; art. 17). Estágio desconhecido não é adivinhado."""
    orgao = str(case.get("orgao_autuador") or "").strip() or LINHA_EM_BRANCO
    estagio = str(case.get("especie_documento") or "").strip()
    if estagio == DEFESA_PREVIA:
        return f"À Autoridade de Trânsito do órgão autuador {orgao}"
    if estagio == RECURSO_JARI:
        return (
            "Ao Senhor Presidente da Junta Administrativa de Recursos de Infrações (JARI) "
            f"do órgão autuador {orgao}"
        )
    return f"À {LINHA_EM_BRANCO}"


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


def _local(case: dict[str, Any]) -> str:
    cidade = str(case.get("cidade") or "").strip()
    uf = str(case.get("estado") or "").strip().upper()
    return f"{cidade}/{uf}" if cidade and uf else (cidade or LINHA_EM_BRANCO)


def fecho(case: dict[str, Any]) -> str:
    nome = str(case.get("nome") or "").strip() or LINHA_EM_BRANCO
    return (
        f"{_local(case)}, ____ de ______________ de ________.\n\n"
        "______________________________\n"
        f"{nome}\n"
        f"CPF {_cpf(case.get('cpf'))}"
    )


def _txt(case: dict[str, Any], chave: str) -> str:
    return str(case.get(chave) or "").strip()


def _estagio(case: dict[str, Any]) -> str | None:
    estagio = _txt(case, "especie_documento")
    return estagio if estagio in _NOMES else None


def titulo(case: dict[str, Any]) -> str | None:
    estagio = _estagio(case)
    return _NOMES[estagio][0] if estagio else None


def data_da_infracao(valor: Any) -> str:
    """O relógio de parede do auto (`timestamp` sem fuso): nunca se converte."""
    texto = str(valor or "").strip()
    m = _DATA.match(texto)
    if not m:
        return texto
    ano, mes, dia, hora, minuto = m.groups()
    return f"{dia}/{mes}/{ano}" + (f" {hora}:{minuto}" if hora else "")


def campos(case: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    auto = ("Auto de infração", _txt(case, "numero_auto") or LINHA_CURTA)
    placa = ("Placa", _txt(case, "placa").upper() or LINHA_CURTA)
    data = ("Data da infração", data_da_infracao(case.get("data_infracao")) or LINHA_CURTA)
    if _estagio(case) == RECURSO_JARI:
        notificacao = ("Notificação de penalidade", _txt(case, "notificacao_penalidade") or LINHA_CURTA)
        return (auto, notificacao, placa, data)
    return (auto, placa, data)


def _cep(valor: Any) -> str:
    texto = str(valor or "").strip()
    digitos = re.sub(r"\D", "", texto)
    if len(digitos) == 8:
        return f"{digitos[:5]}-{digitos[5:]}"
    return texto or LINHA_CURTA


def qualificacao(case: dict[str, Any]) -> str:
    """Sem marca de gênero: o formulário não pergunta (spec 2026-10-02, §3.2)."""
    estagio = _estagio(case)
    auto = _txt(case, "numero_auto") or LINHA_EM_BRANCO
    partes = [
        _txt(case, "nome").upper() or LINHA_EM_BRANCO,
        f"CPF nº {_cpf(case.get('cpf'))}",
    ]
    cnh = _txt(case, "cnh")
    if cnh:  # quem recorre pode ser o proprietário que não dirigia
        partes.append(f"CNH nº {cnh}")
    partes.append(
        f"com endereço em {_txt(case, 'endereco') or LINHA_EM_BRANCO}, "
        f"CEP {_cep(case.get('cep'))}, {_local(case)}"
    )
    partes.append(f"e-mail {_txt(case, 'email') or LINHA_EM_BRANCO}")
    if estagio == RECURSO_JARI:
        notificacao = _txt(case, "notificacao_penalidade") or LINHA_EM_BRANCO
        ato = (
            f"interpor RECURSO contra a penalidade imposta na Notificação de Penalidade nº "
            f"{notificacao}, referente ao Auto de Infração nº {auto}"
        )
    else:
        peca = "DEFESA PRÉVIA" if estagio == DEFESA_PREVIA else LINHA_EM_BRANCO
        ato = f"apresentar {peca} em face do Auto de Infração nº {auto}"
    return ", ".join(partes) + f", vem, respeitosamente, {ato}, pelos fundamentos a seguir expostos."


def pedido(
    case: dict[str, Any],
    situacao_velocidade: str | None,
    inciso_da_conta: str | None,
    cabe_advertencia: bool,
) -> tuple[str, ...]:
    """O pedido é do código (spec 2026-10-02, §3.3): o modelo nunca formula um
    pedido contra o cliente nem esquece o principal. A ordem da desclassificação
    é a da spec de 30/09/2026."""
    recurso = _estagio(case) == RECURSO_JARI
    auto = _txt(case, "numero_auto") or LINHA_EM_BRANCO
    inconsistencia = (
        f"o arquivamento do Auto de Infração nº {auto} por inconsistência, nos termos do "
        "art. 281, § 1º, I, do CTB"
    )
    itens: list[str] = []
    if situacao_velocidade == "sem_infracao":
        motivo = "uma vez que a velocidade considerada no próprio auto não supera a máxima permitida"
        if recurso:
            itens.append(
                f"o provimento deste recurso, com o cancelamento da penalidade imposta e {inconsistencia}, {motivo}"
            )
        else:
            itens.append(f"{inconsistencia}, {motivo}")
    elif situacao_velocidade == "desclassificacao" and inciso_da_conta:
        alvo = (
            f"para o art. 218, {inciso_da_conta}, do CTB, compatível com a velocidade "
            "considerada no próprio auto"
        )
        if recurso:
            itens.append(
                f"o provimento deste recurso, para desclassificar a infração {alvo}, com a "
                "readequação da penalidade"
            )
        else:
            itens.append(f"a desclassificação da infração {alvo}")
        itens.append(f"subsidiariamente, {inconsistencia}")
    elif recurso:
        itens.append(
            "o conhecimento e o provimento deste recurso, com o cancelamento da penalidade "
            f"imposta e o arquivamento do Auto de Infração nº {auto}"
        )
    elif _estagio(case) == DEFESA_PREVIA:
        itens.append(
            f"o acolhimento desta defesa prévia, com o arquivamento do Auto de Infração nº {auto} "
            "e a declaração de insubsistência do seu registro"
        )
    else:
        itens.append(f"o acolhimento desta peça, com o arquivamento do Auto de Infração nº {auto}")
    if cabe_advertencia:
        itens.append(_ADVERTENCIA)
    ultimo = len(itens) - 1
    return tuple(
        f"{'abcdefgh'[i]}) {item}{'.' if i == ultimo else ';'}" for i, item in enumerate(itens)
    )


def nome_arquivo(case: dict[str, Any]) -> str:
    estagio = _estagio(case)
    auto = re.sub(r"[^A-Za-z0-9-]", "", _txt(case, "numero_auto"))
    if estagio and auto:
        return f"{_NOMES[estagio][2]}-{auto}.pdf"
    case_id = re.sub(r"[^A-Za-z0-9_-]", "", _txt(case, "case_id"))
    return f"peca-{case_id}.pdf" if case_id else "peca.pdf"


def titulo_documento(case: dict[str, Any]) -> str:
    estagio = _estagio(case)
    nome = _NOMES[estagio][1] if estagio else "Peça"
    auto = _txt(case, "numero_auto")
    return f"{nome} — Auto nº {auto}" if auto else nome


def corpo_do_email(case_id: str) -> str:
    """O aviso de revisão saiu da peça (o cliente protocola o PDF como está) e
    veio para cá, em passos (spec 2026-10-02, §4.7)."""
    return (
        "Olá,\n\n"
        "Sua peça está pronta, em anexo, para você imprimir e protocolar:\n\n"
        "1. Confira os dados e preencha à mão as linhas em branco.\n"
        "2. Assine no espaço indicado.\n"
        "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação — no "
        "balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.\n\n"
        "Revise o texto antes de protocolar: ele foi redigido com apoio de inteligência "
        "artificial a partir das informações que você enviou.\n\n"
        f"Identificação do pedido: {case_id}\n\n"
        "Cordialmente,\nAmo Recorrer"
    )


def texto_da_peca(rascunho: str, case: dict[str, Any]) -> str:
    t = limpar_markdown(rascunho)
    t = remover_prefacio(t)
    t = remover_enderecamento(t)
    t = cortar_depois_do_pedido(t)
    return f"{enderecamento(case)}\n\n{t}\n\n{fecho(case)}"


def paragrafo_para_pdf(texto: str) -> str:
    return html.escape(texto.strip()).replace("\n", "<br/>")
