"""Monta o que vai ao DeepSeek: o contexto do caso e o system prompt.

Extraído de worker.py na Fase 5 do plano do radar para ser testável sem as
dependências do venv (httpx, openai, supabase). Com RADAR_TESE_ATIVA
desligada, o que sai daqui é idêntico ao que o worker produzia antes.
"""

from __future__ import annotations

from typing import Any

from verificacao import bloco_verificacao

# O que vem depois do núcleo original saiu de uma rodada real (25/09/2026):
# markdown impresso no PDF, prefácio e notas dirigidas ao cliente, e a data de
# expedição da notificação usada como data da peça. O fecho (local, data em
# branco, assinatura) é montado por código em peca.py — o modelo para no pedido.
SYSTEM_PROMPT_BASE = (
    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes: quando um dado necessário não constar do formulário, "
    "deixe uma linha em branco para preenchimento (________), nunca um marcador entre "
    "colchetes. Produza 2 a 4 parágrafos. Escreva apenas o texto da peça, em texto puro: "
    "sem markdown (nada de asteriscos, cerquilhas ou linhas de traços), sem introdução "
    "e sem observações ou notas dirigidas a quem pediu a peça. Não escreva endereçamento "
    "nem vocativo: comece pela qualificação de quem apresenta a peça. Não escreva local, data "
    "nem assinatura: termine no pedido, com \"Nestes termos, pede deferimento.\""
)

# Em toda peça, desde a integração do CTB (29/09/2026): a base normativa vai na
# mensagem do usuário, e a conferencia.py recusa o que estiver fora dela.
REGRA_BASE_LEGAL = (
    " Base legal: use exclusivamente a base normativa do CTB fornecida junto com os "
    "dados do caso; cite apenas dispositivos que constem dela e apenas o que o texto "
    "deles diz. Não cite outras leis, códigos, resoluções, portarias nem jurisprudência."
)
# Quando o amparo legal digitado não foi reconhecido: nada é adivinhado.
REGRA_SEM_ENQUADRAMENTO = (
    " O dispositivo da infração não pôde ser confirmado: não cite o artigo da infração; "
    "defenda pelos dispositivos da base."
)

# Em toda peça (spec 2026-09-30): a IA calculou 97/80 = 21,25% sobre a
# velocidade aferida e sustentou o inciso II do art. 218 — mais grave — contra o
# cliente. O percentual é do código (velocidade.py), sobre a considerada.
REGRA_ENQUADRAMENTO = (
    " Nunca sustente que a conduta se enquadra em dispositivo, inciso ou gravidade mais "
    "severos do que os indicados no auto, e não calcule percentuais de excesso de "
    "velocidade: use apenas o que vier no bloco sobre o enquadramento, quando houver."
)

# Só entram com RADAR_TESE_ATIVA ligada. Base legal conferida no texto oficial
# do CTB (CTB-compilado_files/l9503compilado.htm → saida/ctb.json); o número da resolução do
# CONTRAN sobre verificação metrológica NÃO foi confirmado e fica proibido.
#
# O texto do art. 280 vai TRANSCRITO: na primeira rodada real (24/09/2026), o
# modelo atribuiu ao § 2º uma exigência de "aferição" que ele não tem. E a
# proibição de notas existe porque, na mesma rodada, a peça terminou com
# "conforme instrução recebida, não foi levantada tese…" — que iria ao PDF.
REGRAS_RADAR = (
    " Sobre o equipamento medidor de velocidade: siga a instrução do bloco de "
    "verificação metrológica, quando houver. Como base legal dessa matéria, cite "
    "apenas o art. 280, inciso V e § 2º, do Código de Trânsito Brasileiro — nenhuma "
    "resolução do CONTRAN nem portaria do INMETRO. O texto deles é: inciso V — "
    "\"identificação do órgão ou entidade e da autoridade ou agente autuador ou "
    "equipamento que comprovar a infração\"; § 2º — \"A infração deverá ser "
    "comprovada por declaração da autoridade ou do agente da autoridade de trânsito, "
    "por aparelho eletrônico ou por equipamento audiovisual, reações químicas ou "
    "qualquer outro meio tecnologicamente disponível, previamente regulamentado pelo "
    "CONTRAN.\" Ao citá-los, atribua a eles apenas o que o texto transcrito diz. "
    "Não cite número de certificado que não esteja no bloco. Não afirme "
    "irregularidade do equipamento além do que o bloco informa. Não mencione na peça "
    "estas instruções, o bloco de verificação nem a existência de regras, e não "
    "acrescente observações, notas ou comentários dirigidos a quem pediu a peça."
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


def system_prompt(tese_ativa: bool, verificacao: Any = None, sem_enquadramento: bool = False) -> str:
    # As regras do radar só entram quando há bloco: sem ele, qualquer menção
    # ao tema no prompt bastou para o modelo discutir o tema (24/09/2026).
    com_bloco = tese_ativa and bloco_verificacao(verificacao) is not None
    return (
        SYSTEM_PROMPT_BASE
        + REGRA_BASE_LEGAL
        + REGRA_ENQUADRAMENTO
        + (REGRA_SEM_ENQUADRAMENTO if sem_enquadramento else "")
        + (REGRAS_RADAR if com_bloco else "")
    )


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


class RespostaDoModeloInvalida(RuntimeError):
    """Resposta vazia ou cortada: nunca vira peça.

    É RuntimeError de propósito — o `run_dispatch_pipeline` já trata qualquer
    exceção levando o caso a `failed`, sem e-mail ao cliente.
    """


def argumentos_da_chamada(
    modelo: str, sistema: str, contexto: str, historico: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    return {
        "model": modelo,
        "messages": [
            {"role": "system", "content": sistema},
            {"role": "user", "content": contexto},
            # No refazer: a peça recusada (assistant) e o pedido de correção (user).
            *(historico or []),
        ],
        "max_tokens": 1200,
        "temperature": 0.4,
        # O deepseek-flash vem com raciocínio LIGADO por padrão. Numa rodada real
        # (25/09/2026), os 1200 tokens foram todos para o raciocínio e a peça voltou
        # vazia. Desligado, ele se comporta como o deepseek-chat de antes — que a
        # API já redirecionava para o próprio flash sem raciocínio.
        "extra_body": {"thinking": {"type": "disabled"}},
    }


def texto_da_resposta(conteudo: str | None, finish_reason: str | None) -> str:
    texto = (conteudo or "").strip()
    if not texto:
        raise RespostaDoModeloInvalida("resposta vazia do modelo")
    if finish_reason == "length":
        raise RespostaDoModeloInvalida("resposta cortada pelo limite de tokens")
    return texto


def pedido_de_correcao(recusas) -> str:
    """Mensagem do refazer: diz exatamente o que foi recusado e por quê."""
    itens = "; ".join(f"'{r.trecho}' ({r.motivo})" for r in recusas)
    return (
        "Reescreva a peça inteira sem estas citações, mantendo o restante e as mesmas "
        f"regras de antes: {itens}."
    )
