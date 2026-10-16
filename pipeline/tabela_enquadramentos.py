"""Tabela de códigos de enquadramento (Anexo IV da Portaria SENATRAN 354/2022),
gerada por enquadramentos/enquadramentos_parser.py (spec 2026-10-15).

Traduz o código impresso na notificação ("7455-0", "745-50", "74550") no
dispositivo do CTB. A leitura do código é a mesma de src/lib/enquadramentos.ts,
garantida por tests/compartilhados/codigos.json.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

# Ordem importa: "7455-0" antes de "745-50", e os dois antes dos cinco dígitos
# colados. As bordas (?<!\d)/(?!\d) impedem ler código dentro de data ou número
# maior ("2026-10-15", "123456").
_CODIGO = (
    re.compile(r"(?<!\d)(\d{4})\s?-\s?(\d)(?!\d)"),
    re.compile(r"(?<!\d)(\d{3})\s?-\s?(\d)(\d)(?!\d)"),
    re.compile(r"(?<!\d)(\d{4})(\d)(?!\d)"),
)


def ler_codigo(texto: str | None) -> str | None:
    """O primeiro código de enquadramento no texto, como "7455-0", ou None."""
    if not texto:
        return None
    for padrao in _CODIGO:
        m = padrao.search(str(texto))
        if m:
            g = m.groups()
            return f"{g[0]}{g[1]}-{g[2]}" if len(g) == 3 else f"{g[0]}-{g[1]}"
    return None


class TabelaIndisponivel(RuntimeError):
    """Sem a tabela, o pipeline não sobe (spec 2026-10-15, §6.1)."""


@dataclass(frozen=True)
class Tabela:
    por_codigo: dict[str, dict[str, Any]]
    ctb_sha256: str

    def dispositivo(self, codigo: str | None) -> str | None:
        """Dispositivo do CTB do código — só dos códigos que a lista oferece."""
        item = self.por_codigo.get(codigo or "")
        return item["dispositivo"] if item and item.get("na_lista") else None


@lru_cache(maxsize=4)
def carregar_tabela(caminho: str) -> Tabela:
    """Uma vez por processo. Exceção não entra no cache do lru_cache."""
    arquivo = Path(caminho)
    try:
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        itens = dados["enquadramentos"]
        ctb_sha256 = dados["meta"]["ctb_sha256"]
        por_codigo = {i["codigo"]: i for i in itens}
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise TabelaIndisponivel(f"tabela de enquadramentos ausente ou inválida em {arquivo}: {e}") from e
    return Tabela(por_codigo=por_codigo, ctb_sha256=ctb_sha256)
