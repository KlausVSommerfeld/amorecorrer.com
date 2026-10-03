"""A página da peça (spec 2026-10-02, §4.2): da `Peca` ao PDF, no estilo
"Notificação e Resposta" — forma forense com o quadro de campos do auto.

Precisa de reportlab e pyphen (venv). O texto vem pronto de peca.py; aqui só
se desenha.
"""

from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from peca import Peca, paragrafo_para_pdf

FONTES_DIR = Path(__file__).resolve().parent / "fontes"
FONTES = {
    "Serif": "SourceSerif4-Regular.ttf",
    "Serif-Semibold": "SourceSerif4-Semibold.ttf",
    "Serif-Bold": "SourceSerif4-Bold.ttf",
    "Serif-Italic": "SourceSerif4-It.ttf",
    "Mono": "IBMPlexMono-Regular.ttf",
    "Mono-Medium": "IBMPlexMono-Medium.ttf",
}
# Só preto e um cinza nos rótulos: a peça é impressa em casa.
CINZA = colors.HexColor("#555555")
_registradas = False


class FonteAusente(RuntimeError):
    """Sem as fontes não há peça: o pipeline acusa ao subir (main.py)."""


def registrar_fontes() -> None:
    global _registradas
    if _registradas:
        return
    faltando = [a for a in FONTES.values() if not (FONTES_DIR / a).is_file()]
    if faltando:
        raise FonteAusente(f"fontes ausentes em {FONTES_DIR}: {', '.join(faltando)}")
    for nome, arquivo in FONTES.items():
        pdfmetrics.registerFont(TTFont(nome, str(FONTES_DIR / arquivo)))
    pdfmetrics.registerFontFamily(
        "Serif", normal="Serif", bold="Serif-Bold", italic="Serif-Italic", boldItalic="Serif-Bold"
    )
    _registradas = True


def _estilos() -> dict[str, ParagraphStyle]:
    # Hifenização em português: sem ela, o justificado abre rios entre as palavras.
    corpo = ParagraphStyle(
        "corpo", fontName="Serif", fontSize=12, leading=18, alignment=TA_JUSTIFY,
        firstLineIndent=1.25 * cm, spaceAfter=6, hyphenationLang="pt_BR",
    )
    return {
        "corpo": corpo,
        "enderecamento": ParagraphStyle(
            "enderecamento", parent=corpo, fontName="Serif-Semibold", alignment=TA_LEFT,
            firstLineIndent=0, spaceAfter=0, hyphenationLang="",
        ),
        "titulo": ParagraphStyle(
            "titulo", fontName="Serif-Bold", fontSize=14, leading=18, alignment=TA_LEFT,
            spaceBefore=4, spaceAfter=8,
        ),
        "secao": ParagraphStyle(
            "secao", fontName="Serif-Bold", fontSize=12, leading=16, alignment=TA_LEFT,
            spaceBefore=10, spaceAfter=0, keepWithNext=1,
        ),
        "item": ParagraphStyle(
            "item", parent=corpo, firstLineIndent=-0.75 * cm, leftIndent=0.75 * cm,
        ),
        "rotulo": ParagraphStyle("rotulo", fontName="Mono", fontSize=6.5, leading=8, textColor=CINZA),
        "valor": ParagraphStyle("valor", fontName="Mono-Medium", fontSize=9.5, leading=12),
        "fecho": ParagraphStyle(
            "fecho", parent=corpo, alignment=TA_LEFT, hyphenationLang="",
        ),
        "assinatura": ParagraphStyle(
            "assinatura", parent=corpo, alignment=TA_CENTER, firstLineIndent=0, spaceAfter=0,
            hyphenationLang="",
        ),
    }


def _p(texto: str, estilo: ParagraphStyle) -> Paragraph:
    return Paragraph(paragrafo_para_pdf(texto), estilo)


def _titulo_espacado(titulo: str) -> str:
    """Caixa alta espaçada: letras separadas por espaço, palavras por espaço largo."""
    palavras = paragrafo_para_pdf(titulo.upper()).split(" ")
    return "&nbsp;&nbsp;".join(" ".join(p) for p in palavras)


def _quadro(campos: tuple[tuple[str, str], ...], e: dict[str, ParagraphStyle]) -> Table:
    sem_respiro = [(k, (0, 0), (-1, -1), 0) for k in ("LEFTPADDING", "RIGHTPADDING", "TOPPADDING")]
    celulas = [
        Table([[_p(rotulo.upper(), e["rotulo"])], [_p(valor, e["valor"])]],
              style=sem_respiro + [("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("FONTNAME", (0, 0), (-1, -1), "Mono")])
        for rotulo, valor in campos
    ]
    t = Table([celulas], colWidths=[None] * len(campos))
    t.setStyle(TableStyle([
        # Sem FONTNAME (aqui e na célula), a tabela declara Helvetica no PDF à toa.
        ("FONTNAME", (0, 0), (-1, -1), "Mono"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


class _CanvasNumerado(rl_canvas.Canvas):
    """Numera "página/total": o total só se sabe no fim, então as páginas são
    guardadas e desenhadas no save()."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paginas: list[dict] = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for estado in self._paginas:
            self.__dict__.update(estado)
            self.setFont("Serif", 9)
            self.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"{self._pageNumber}/{total}")
            super().showPage()
        super().save()


def gerar_pdf(peca: Peca) -> bytes:
    registrar_fontes()
    e = _estilos()
    story: list = [
        _p(peca.enderecamento, e["enderecamento"]),
        HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=6, spaceAfter=12),
    ]
    if peca.titulo:
        story.append(Paragraph(_titulo_espacado(peca.titulo), e["titulo"]))
    story += [_quadro(peca.campos, e), Spacer(1, 14), _p(peca.qualificacao, e["corpo"])]

    def secao(titulo: str) -> list:
        return [
            _p(titulo, e["secao"]),
            HRFlowable(width="100%", thickness=0.4, color=colors.black, spaceBefore=2, spaceAfter=8),
        ]

    for titulo, paragrafos in peca.secoes:
        story += secao(titulo) + [_p(par, e["corpo"]) for par in paragrafos]
    story += secao(peca.titulo_pedido) + [_p(peca.abertura_pedido, e["corpo"])]
    story += [_p(item, e["item"]) for item in peca.pedido]
    story.append(_p("Nestes termos, pede deferimento.", e["fecho"]))
    local, _, assinatura = peca.fecho.partition("\n\n")
    # O fecho não se parte entre páginas.
    story.append(KeepTogether([
        Spacer(1, 6), _p(local, e["fecho"]), Spacer(1, 28), _p(assinatura, e["assinatura"]),
    ]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=3 * cm, rightMargin=2 * cm, topMargin=2.5 * cm,
        bottomMargin=2 * cm, title=peca.titulo_documento, author="", creator="", subject="",
        initialFontName="Serif",  # sem Helvetica declarada à toa no PDF
    )
    doc.build(story, canvasmaker=_CanvasNumerado)
    return buf.getvalue()
