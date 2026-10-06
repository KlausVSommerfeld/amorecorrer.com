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
from dataclasses import dataclass
from typing import Any

from prompt import RespostaDoModeloInvalida

LINHA_EM_BRANCO = "______________________"
LINHA_CURTA = "__________"  # no quadro de campos: a linha longa não cabe na célula
ABERTURA_PEDIDO = "Isto posto, requer:"
_ADVERTENCIA = (
    "subsidiariamente, não havendo outra infração cometida nos últimos 12 (doze) meses, a "
    "aplicação da penalidade de advertência por escrito em substituição à multa, nos termos "
    "do art. 267 do CTB"
)

# Aviso do e-mail (spec 2026-10-05, §4.4): só na defesa prévia e só quando o cliente
# respondeu que outra pessoa dirigia. Sem formulário nem resolução do CONTRAN, que
# não temos conferidos; o prazo é o do art. 257, § 7º, do CTB.
AVISO_INDICACAO_CONDUTOR = (
    "Se outra pessoa dirigia o veículo: indique o condutor ao órgão de trânsito em até "
    "30 dias contados da notificação da autuação, pelo meio que consta da notificação. Sem a "
    "indicação, a responsabilidade pela infração passa a ser sua (art. 257, § 7º, do CTB). A "
    "indicação é feita à parte e não substitui esta defesa."
)

# Rede de segurança (spec 2026-10-05, §4.3): a peça fala do "autuado", nunca do
# "cliente". Numa sonda real, o modelo escreveu "Não há relato do cliente sobre as
# circunstâncias da autuação." — que iria ao PDF.
_PALAVRA_CLIENTE = re.compile(r"\bclientes?\b", re.IGNORECASE)
# Frase que fala do próprio relato, em vez de usá-lo como fato. Na 3ª rodada real
# (05/10/2026), com um relato que pedia uma mentira, o modelo escreveu "O relato
# apresentado não traz fatos […], limitando-se a solicitar que se afirme, ainda que
# não seja verdade…" — sem a palavra "cliente", e contando ao órgão o pedido.
# "O relato de que a placa caiu reforça…" e "Segundo o relato, não há placa" ficam.
_FALA_DO_RELATO = re.compile(
    r"\b(não há|não houve|inexiste|sem)\s+(qualquer\s+)?relato\b"
    r"|\brelato\b[^.]{0,40}\b(não\s+(traz|trouxe|contém|apresenta|menciona|informa|descreve|narra)"
    r"|limita-se|limitando-se|se limita)\b"
    r"|\brelato\b[^.]*\b(solicit\w*|pede|pedindo|pediu)\b",
    re.IGNORECASE,
)
# Fim de frase: pontuação, espaço e maiúscula. "art. 218" não corta (dígito);
# "Av. Lúcio" e afins não cortam pelas abreviações listadas.
_FIM_DE_FRASE = re.compile(
    r"(?<=[.!?])(?<!\bAv\.)(?<!\bDr\.)(?<!\bDra\.)(?<!\bSr\.)(?<!\bSra\.)"
    r"(?<!\bArt\.)(?<!\bArts\.)(?<!\bProf\.)\s+(?=[A-ZÀ-Ý])"
)


def _fala_de_quem_pediu(texto: str) -> bool:
    return bool(_PALAVRA_CLIENTE.search(texto) or _FALA_DO_RELATO.search(texto))


def remover_frases_do_cliente(paragrafos: list[str]) -> tuple[list[str], int]:
    """Tira toda frase que fale do "cliente" ou do próprio relato; parágrafo que
    fique vazio sai inteiro. Parágrafo sem nenhuma delas fica byte a byte igual.
    Devolve (parágrafos, frases tiradas)."""
    saida: list[str] = []
    removidas = 0
    for paragrafo in paragrafos:
        if not _fala_de_quem_pediu(paragrafo):
            saida.append(paragrafo)
            continue
        frases = _FIM_DE_FRASE.split(paragrafo)
        ficam = [f for f in frases if not _fala_de_quem_pediu(f)]
        removidas += len(frases) - len(ficam)
        if ficam:
            saida.append(" ".join(f.strip() for f in ficam))
    return saida, removidas

_PEDIDO = re.compile(r"\b(pede|requer|espera|aguarda|peço)\s+deferimento\b[^\n]*", re.IGNORECASE)
# Só rótulo com dois pontos: desde que o modelo termina nos fundamentos (02/10/2026),
# "Nota-se, ainda, que…" é argumento, não nota ao cliente.
_NOTA = re.compile(r"^[*_\s]*(observa[çc][ãa]o|obs\.?|nota)\s*:", re.IGNORECASE)
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
# Título de seção (spec 2026-10-02, §4.1): numeração opcional ("I –", "1.", "I)"),
# caixa qualquer, dois pontos; e o texto pode vir na mesma linha depois de ":" ou "–".
_TITULO_SECAO = re.compile(
    r"^\s*(?:(?:[IVX]+|\d+)\s*[-–—.)]\s*)?"
    r"(?P<nome>(?:d[oa]s?\s+)?fatos\s+e\s+(?:d[oa]s?\s+)?fundamentos(?:\s+jur[ií]dicos)?"
    r"|d[oa]s?\s+fatos"
    r"|d[oa]s?\s+fundamentos(?:\s+jur[ií]dicos)?"
    r"|d[oa]\s+direito"
    r"|(?:d[oa]s?\s+)?pedidos?(?:\s+subsidi[aá]rios?)?"
    r"|d[oa]s?\s+requerimentos?"
    r"|(?:d[oa]\s+)?conclus[aã]o)"
    r"\s*(?:$|[:–—-]\s*(?P<resto>.*)$)",
    re.IGNORECASE,
)
# Fecho de pedido que o modelo escreve no fim, apesar do prompt.
_PEDIDO_FINAL = re.compile(
    r"^(?:diante do exposto|ante o exposto|pelo exposto|por todo o exposto|isto posto|"
    r"(?:nestes|nesses) termos|termos em que)\b",
    re.IGNORECASE,
)
# "requerente", "requerimento", "requerido" não são pedido (revisão final, 02/10/2026).
_REQUER = re.compile(r"\brequer(?:-se|em)?\b|\bdeferimento\b", re.IGNORECASE)
_ITEM = re.compile(r"^[a-h]\)\s")
_DEFERIMENTO_SOLTO = re.compile(
    r"^[^.]{0,40}?\b(?:pede|espera|aguarda|requer)\s+deferimento\.?$", re.IGNORECASE
)
_PEDE_DEFERIMENTO_NO_FIM = re.compile(
    r"\s*(?:(?:nestes|nesses) termos|termos em que|respeitosamente),?\s*"
    r"(?:pede|espera|aguarda|requer)\s+deferimento\.?\s*$",
    re.IGNORECASE,
)
# A qualificação que o modelo escreve: "vem, respeitosamente, (…) apresentar/interpor".
# Um "vem" qualquer ("vem, desde então, contestando") não basta.
_QUALIFICACAO = re.compile(
    r"\bvem,?\s+(?:[^\s,]+,?\s+){0,8}?(?:apresentar|interpor|requerer|opor|oferecer|impugnar)\b",
    re.IGNORECASE,
)
_CAMPO_SOLTO = re.compile(r"^[^:\n]{2,40}:\s*\S.{0,80}$")
_ROMANOS = ("I", "II", "III", "IV")
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


def _deferimento_solto(paragrafo: str) -> bool:
    return len(paragrafo) <= 80 and bool(_DEFERIMENTO_SOLTO.search(paragrafo))


def remover_pedido(paragrafos: list[str]) -> tuple[list[str], bool]:
    """Tira do fim o pedido e o "pede deferimento" que o modelo escrever: o pedido
    é do código. Fundamento que começa por "Ante o exposto" sem requerer nada fica."""
    pars = list(paragrafos)
    removido = False
    # Pedido enumerado: "Diante do exposto, requer:" seguido só de itens a), b)… e do fecho.
    for k in range(len(pars) - 1, -1, -1):
        if _PEDIDO_FINAL.match(pars[k]) and _REQUER.search(pars[k]):
            if all(_ITEM.match(p) or _deferimento_solto(p) for p in pars[k + 1:]):
                del pars[k:]
                removido = True
            break
    while pars and (
        _deferimento_solto(pars[-1]) or (_PEDIDO_FINAL.match(pars[-1]) and _REQUER.search(pars[-1]))
    ):
        pars.pop()
        removido = True
    if pars:
        sem_fecho = _PEDE_DEFERIMENTO_NO_FIM.sub("", pars[-1]).strip()
        if sem_fecho != pars[-1]:
            removido = True
            if sem_fecho:
                pars[-1] = sem_fecho
            else:
                pars.pop()
    return pars, removido


def _tipo_de_secao(nome: str) -> str:
    n = nome.lower()
    if "pedido" in n or "requerimento" in n or "conclus" in n:
        return "pedido"
    if "fatos" in n and "fundamentos" in n:
        return "ambos"
    return "fatos" if "fatos" in n else "fundamentos"


def _blocos(linhas: list[str]) -> list[str]:
    return [b for b in re.split(r"\n[ \t]*\n", "\n".join(linhas)) if b.strip()]


def _juntar(bloco: str) -> str:
    # Linhas quebradas pelo modelo dentro de um parágrafo: no PDF justificado,
    # cada "\n" viraria quebra forçada.
    return " ".join(linha.strip() for linha in bloco.split("\n") if linha.strip())


def _cabecalho_solto(bloco: str) -> bool:
    """"DEFESA PRÉVIA", "Auto de Infração nº: E123" — o que o modelo antigo punha no topo."""
    linhas = [l.strip() for l in bloco.split("\n") if l.strip()]
    # Frase terminada em ponto é texto, não cabeçalho ("[Modo sem IA: …] Rascunho indisponível.").
    return all(
        len(l) <= 80 and not l.endswith(".")
        and (not re.search(r"[a-zà-ÿ]", l) or _CAMPO_SOLTO.match(l))
        for l in linhas
    )


def _e_qualificacao(paragrafo: str, nome_cliente: str) -> bool:
    inicio = paragrafo[:700]
    pelo_nome = bool(nome_cliente) and paragrafo.lower().startswith(nome_cliente.lower())
    return bool(_QUALIFICACAO.search(inicio)) and (pelo_nome or "CPF" in inicio)


def separar_secoes(
    rascunho: str, nome_cliente: str = ""
) -> tuple[tuple[tuple[str, tuple[str, ...]], ...], bool]:
    """Corta o rascunho em DOS FATOS / DOS FUNDAMENTOS; sem os títulos, seção única.
    Devolve (seções sem numeração, houve pedido do modelo removido)."""
    t = remover_prefacio(limpar_markdown(rascunho))
    t = cortar_depois_do_pedido(remover_enderecamento(t))
    linhas: dict[str, list[str]] = {"antes": [], "fatos": [], "fundamentos": [], "ambos": []}
    atual, titulos, removido = "antes", set(), False
    for linha in t.split("\n"):
        m = _TITULO_SECAO.match(linha)
        if m:
            tipo = _tipo_de_secao(m.group("nome"))
            if tipo == "pedido":
                removido = True
                break
            atual = tipo
            titulos.add(tipo)
            if (m.group("resto") or "").strip():
                linhas[atual].append(m.group("resto").strip())
            continue
        linhas[atual].append(linha)

    antes = _blocos(linhas["antes"])
    while antes and _cabecalho_solto(antes[0]):
        antes.pop(0)
    antes = [_juntar(b) for b in antes]
    if antes and _e_qualificacao(antes[0], nome_cliente):
        antes.pop(0)

    def pars(chave: str) -> list[str]:
        return [_juntar(b) for b in _blocos(linhas[chave])]

    if titulos & {"fatos", "fundamentos"}:
        secoes = [
            ("DOS FATOS", pars("fatos") if "fatos" in titulos else antes),
            ("DOS FUNDAMENTOS", pars("fundamentos") + pars("ambos")),
        ]
    else:
        secoes = [("DOS FATOS E DOS FUNDAMENTOS", pars("ambos") if "ambos" in titulos else antes)]

    secoes = [(nome, p) for nome, p in secoes if p]
    if secoes:
        nome, ultimos = secoes[-1]
        ultimos, r = remover_pedido(ultimos)
        removido = removido or r
        secoes[-1] = (nome, ultimos)
        secoes = [(nome, p) for nome, p in secoes if p]
    if not secoes:
        raise RespostaDoModeloInvalida("peça sem fatos nem fundamentos depois da limpeza")
    return tuple((nome, tuple(p)) for nome, p in secoes), removido


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


def corpo_do_email(case: dict[str, Any]) -> str:
    """O aviso de revisão saiu da peça (o cliente protocola o PDF como está) e
    veio para cá, em passos (spec 2026-10-02, §4.7). O aviso de indicação do
    condutor entra só na defesa prévia com outra pessoa dirigindo (spec 2026-10-05)."""
    aviso = (
        f"{AVISO_INDICACAO_CONDUTOR}\n\n"
        if _estagio(case) == DEFESA_PREVIA and case.get("cliente_conduzia") is False
        else ""
    )
    return (
        "Olá,\n\n"
        "Sua peça está pronta, em anexo, para você imprimir e protocolar:\n\n"
        "1. Confira os dados e preencha à mão as linhas em branco.\n"
        "2. Assine no espaço indicado.\n"
        "3. Protocole no órgão de trânsito até o prazo que consta da sua notificação — no "
        "balcão, pelos Correios ou pelo site do órgão, conforme ele aceitar.\n\n"
        f"{aviso}"
        "Revise o texto antes de protocolar: ele foi redigido com apoio de inteligência "
        "artificial a partir das informações que você enviou.\n\n"
        f"Identificação do pedido: {_txt(case, 'case_id')}\n\n"
        "Cordialmente,\nAmo Recorrer"
    )


@dataclass(frozen=True)
class Peca:
    """Tudo o que o PDF desenha, já em texto (pdf_peca.gerar_pdf só desenha)."""

    enderecamento: str
    titulo: str | None
    campos: tuple[tuple[str, str], ...]
    qualificacao: str
    secoes: tuple[tuple[str, tuple[str, ...]], ...]
    titulo_pedido: str
    abertura_pedido: str
    pedido: tuple[str, ...]
    fecho: str
    nome_arquivo: str
    titulo_documento: str
    pedido_do_modelo_removido: bool
    frases_do_cliente_removidas: int = 0


def montar_peca(
    rascunho: str,
    case: dict[str, Any],
    situacao_velocidade: str | None = None,
    inciso_da_conta: str | None = None,
    cabe_advertencia: bool = False,
) -> Peca:
    secoes_cruas, removido = separar_secoes(rascunho, _txt(case, "nome"))
    limpas: list[tuple[str, tuple[str, ...]]] = []
    frases_removidas = 0
    for nome, paragrafos in secoes_cruas:
        ficam, n = remover_frases_do_cliente(list(paragrafos))
        frases_removidas += n
        if ficam:
            limpas.append((nome, tuple(ficam)))
    if not limpas:
        raise RespostaDoModeloInvalida("peça sem fatos nem fundamentos depois da limpeza")
    secoes = tuple(limpas)
    return Peca(
        enderecamento=enderecamento(case),
        titulo=titulo(case),
        campos=campos(case),
        qualificacao=qualificacao(case),
        secoes=tuple((f"{_ROMANOS[i]} – {nome}", p) for i, (nome, p) in enumerate(secoes)),
        titulo_pedido=f"{_ROMANOS[len(secoes)]} – DO PEDIDO",
        abertura_pedido=ABERTURA_PEDIDO,
        pedido=pedido(case, situacao_velocidade, inciso_da_conta, cabe_advertencia),
        fecho=fecho(case),
        nome_arquivo=nome_arquivo(case),
        titulo_documento=titulo_documento(case),
        pedido_do_modelo_removido=removido,
        frases_do_cliente_removidas=frases_removidas,
    )


def paragrafo_para_pdf(texto: str) -> str:
    return html.escape(texto.strip()).replace("\n", "<br/>")
