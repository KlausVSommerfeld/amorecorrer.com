"""Verificação do medidor -> texto do prompt. Fase 5 do plano do radar.

Puro, sem dependências: testável com unittest fora do venv de Windows.

A regra de redação é escolhida AQUI, em código. O modelo recebe uma
instrução só, já decidida, e o que a regra proíbe citar nem chega ao bloco —
ele não tem como citar o que não recebeu.
"""

from __future__ import annotations

import json
from typing import Any

INSTRUCAO_REPROVADO = (
    "Sustente que o equipamento medidor foi reprovado na verificação metrológica que "
    "cobre a data da infração, citando a data do laudo e o resultado informados acima, "
    "e o número do certificado somente se ele constar acima."
)
INSTRUCAO_EXIBICAO = (
    "Requeira que o órgão autuador junte aos autos o certificado de verificação "
    "metrológica do equipamento vigente na data da infração, informando que a consulta "
    "à base pública de dados abertos do INMETRO não o localizou. Não afirme que o "
    "equipamento estava sem verificação ou irregular, e não cite número de certificado."
)

_RESULTADO = {
    INSTRUCAO_REPROVADO: "o equipamento foi reprovado na verificação metrológica que cobre a data da infração.",
    INSTRUCAO_EXIBICAO: (
        "a consulta à base pública não localizou, com segurança, verificação "
        "metrológica vigente na data da infração."
    ),
}


def _como_dict(v: Any) -> dict | None:
    # O Express devolve o jsonb já como objeto; string JSON é defesa, não caso esperado.
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return None
    return v if isinstance(v, dict) else None


def _data_br(valor: Any) -> str | None:
    s = str(valor or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return None


def _proprietario(valor: Any) -> str | None:
    # A fonte do INMETRO manda {Nome, Municipio, Estado}; a carga grava o nome.
    if isinstance(valor, dict):
        valor = valor.get("Nome")
    return str(valor).strip() if valor else None


def instrucao_de_redacao(v: Any) -> str | None:
    """Precedência da spec (§5.2): a primeira regra que casar vence."""
    v = _como_dict(v)
    if not v:
        return None
    status = v.get("status")
    if status in (None, "nao_aplicavel"):
        return None
    # Só confiança alta libera tese forte ou descarte. `media` existe no
    # contrato, ainda que a RPC hoje só produza `alta` e `baixa`.
    if v.get("confianca") != "alta":
        return INSTRUCAO_EXIBICAO
    if status == "reprovado":
        return INSTRUCAO_REPROVADO
    if status == "comprovado_valido":
        # Silêncio, não instrução. Em duas rodadas reais (24/09/2026), um bloco
        # dizendo "não mencione a verificação" fez o modelo mencioná-la e montar
        # tese pelo art. 280. Sem bloco, o caso vai ao modelo como ia antes.
        return None
    return INSTRUCAO_EXIBICAO


def bloco_verificacao(v: Any) -> str | None:
    v = _como_dict(v)
    instrucao = instrucao_de_redacao(v)
    if instrucao is None:
        return None

    linhas = [
        "Verificação metrológica do medidor de velocidade (consulta automática à base do INMETRO):",
        f"- Resultado: {_RESULTADO[instrucao]}",
    ]

    # Equipamento e certificado só entram quando a regra manda citá-los.
    if instrucao == INSTRUCAO_REPROVADO:
        inst = v.get("instrumento") or {}
        local = ", ".join(p for p in (inst.get("local_via"), inst.get("municipio")) if p)
        if local:
            dono = _proprietario(inst.get("proprietario"))
            linhas.append(f"- Equipamento: {local}" + (f" (proprietário: {dono})" if dono else ""))

        cert = v.get("certificado_vigente") or {}
        partes = []
        laudo = _data_br(cert.get("data_laudo"))
        if laudo:
            partes.append(f"laudo de {laudo}")
        validade = _data_br(cert.get("data_validade"))
        if validade:
            partes.append(f"válido até {validade}")
        if cert.get("resultado"):
            partes.append(f"resultado: {cert['resultado']}")
        if cert.get("numero"):
            partes.append(f"certificado nº {cert['numero']}")
        if partes:
            linhas.append("- Verificação que cobre a data: " + ", ".join(partes))

    avisos = [str(a) for a in (v.get("avisos") or []) if a]
    if avisos:
        linhas.append("- Ressalvas da base: " + "; ".join(avisos))

    capturado = _data_br((v.get("evidencia") or {}).get("capturado_em"))
    if capturado:
        linhas.append(f"- Fonte: base de dados abertos do INMETRO/RBMLQ, capturada em {capturado}.")

    linhas.append(f"Instrução para a redação: {instrucao}")
    return "\n".join(linhas)
