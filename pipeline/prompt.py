"""Monta o que vai ao DeepSeek: o contexto do caso e o system prompt.

Extraído de worker.py na Fase 5 do plano do radar para ser testável sem as
dependências do venv (httpx, openai, supabase). Com RADAR_TESE_ATIVA
desligada, o que sai daqui é idêntico ao que o worker produzia antes.
"""

from __future__ import annotations

from typing import Any

from verificacao import bloco_verificacao

SYSTEM_PROMPT_BASE = (
    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
)

# Só entram com RADAR_TESE_ATIVA ligada. Base legal conferida no texto oficial
# do CTB (CTB-compilado_files/L9503Compilado.html); o número da resolução do
# CONTRAN sobre verificação metrológica NÃO foi confirmado e fica proibido.
REGRAS_RADAR = (
    " Sobre o equipamento medidor de velocidade: siga a instrução do bloco de "
    "verificação metrológica, quando houver. Como base legal dessa matéria, cite "
    "apenas o art. 280, inciso V e § 2º, do Código de Trânsito Brasileiro — nenhuma "
    "resolução do CONTRAN nem portaria do INMETRO. Não cite número de certificado "
    "que não esteja no bloco. Não afirme irregularidade do equipamento além do que "
    "o bloco informa."
)

# Campos de controle interno. O read model do Express faz `select("*")`, então a
# linha inteira chegava ao prompt — inclusive o `dup_guard` (hash de 64
# caracteres), o `form_token` e os uuids. Nada disso tem papel numa peça
# jurídica, e tudo compete por atenção com os dados que têm.
#
# `created_at` e `updated_at` saem por um motivo a mais: são `timestamptz` em
# UTC, e a IA lia "10/09" num caso protocolado às 22h do dia 9 em BRT. É o mesmo
# erro de fuso que o front já havia corrigido do lado da data da infração.
# Como nenhum dos dois entra no recurso, saem inteiros em vez de convertidos.
#
# `verificacao_medidor` sai SEMPRE: cru, seria um dict Python ilegível no
# prompt. Com a chave ligada, ele entra como bloco em português.
CAMPOS_INTERNOS = frozenset(
    {
        "id",
        "case_id",
        "form_token",
        "dup_guard",
        "document_status",
        "document_url",
        "stripe_session_id",
        "created_at",
        "updated_at",
        "verificacao_medidor",
    }
)


def system_prompt(tese_ativa: bool) -> str:
    return SYSTEM_PROMPT_BASE + (REGRAS_RADAR if tese_ativa else "")


def build_case_context(case: dict[str, Any], tese_ativa: bool = False) -> str:
    lines = [
        f"{k}: {v}"
        for k, v in sorted(case.items())
        if k not in CAMPOS_INTERNOS and v is not None and str(v).strip()
    ]
    cabecalho = "Dados do caso para o recurso:\n"
    bloco = bloco_verificacao(case.get("verificacao_medidor")) if tese_ativa else None
    if bloco:
        # Fora do corte de 200 linhas: a verificação não pode ser a que some.
        cabecalho += bloco + "\n\n"
    return cabecalho + "\n".join(lines[:200])
