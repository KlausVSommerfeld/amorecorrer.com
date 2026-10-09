"""Novas tentativas do envio do e-mail (teste ponta a ponta de 08/10/2026: uma
falha de DNS passageira levou o caso a `failed` com o PDF pronto).

    python3 -m unittest test_tentativas -v
"""

import asyncio
import unittest

from tentativas import ESPERAS_DO_EMAIL, com_novas_tentativas, falha_passageira


class RespostaSMTP(Exception):
    """Como `aiosmtplib.SMTPResponseException`: o servidor respondeu com um código."""

    def __init__(self, code: int, message: str = "") -> None:
        super().__init__(f"({code}, {message!r})")
        self.code = code


class Operacao:
    def __init__(self, *resultados):
        self.resultados = list(resultados)
        self.chamadas = 0

    async def __call__(self):
        self.chamadas += 1
        r = self.resultados.pop(0)
        if isinstance(r, BaseException):
            raise r
        return r


def rodar(operacao, esperas=ESPERAS_DO_EMAIL):
    dormidas: list[float] = []

    async def dormir(s: float) -> None:
        dormidas.append(s)

    async def principal():
        return await com_novas_tentativas(operacao, esperas=esperas, dormir=dormir, rotulo="teste")

    return asyncio.run(principal()), dormidas


DNS = OSError("Error connecting to smtp.resend.com on port 587: [Errno 11001] getaddrinfo failed")


class TestFalhaPassageira(unittest.TestCase):
    def test_rede_dns_e_tempo_esgotado_sao_passageiros(self):
        self.assertTrue(falha_passageira(DNS))
        self.assertTrue(falha_passageira(ConnectionResetError()))
        self.assertTrue(falha_passageira(TimeoutError()))

    def test_resposta_4xx_e_passageira_e_5xx_nao(self):
        self.assertTrue(falha_passageira(RespostaSMTP(421, "try again later")))
        self.assertFalse(falha_passageira(RespostaSMTP(550, "mailbox unavailable")))
        self.assertFalse(falha_passageira(RespostaSMTP(535, "authentication failed")))

    def test_configuracao_ausente_nao_e_passageira(self):
        self.assertFalse(falha_passageira(RuntimeError("SMTP_HOST and MAIL_FROM are required in production")))


class TestComNovasTentativas(unittest.TestCase):
    def test_sucesso_de_primeira_nao_espera(self):
        op = Operacao("msg-id")
        resultado, dormidas = rodar(op)
        self.assertEqual(resultado, "msg-id")
        self.assertEqual(op.chamadas, 1)
        self.assertEqual(dormidas, [])

    def test_falha_de_dns_passageira_e_repetida_ate_dar_certo(self):
        op = Operacao(DNS, DNS, "msg-id")
        resultado, dormidas = rodar(op)
        self.assertEqual(resultado, "msg-id")
        self.assertEqual(op.chamadas, 3)
        self.assertEqual(dormidas, list(ESPERAS_DO_EMAIL))

    def test_esgotadas_as_tentativas_sobe_a_ultima_falha(self):
        ultima = OSError("ainda sem DNS")
        op = Operacao(DNS, DNS, ultima)
        with self.assertRaises(OSError) as ctx:
            rodar(op)
        self.assertIs(ctx.exception, ultima)
        self.assertEqual(op.chamadas, 3)

    def test_falha_permanente_sobe_sem_repetir(self):
        op = Operacao(RespostaSMTP(550, "mailbox unavailable"), "nunca")
        with self.assertRaises(RespostaSMTP):
            rodar(op)
        self.assertEqual(op.chamadas, 1)

    def test_resposta_4xx_e_repetida(self):
        op = Operacao(RespostaSMTP(451, "temporary"), "msg-id")
        resultado, _ = rodar(op)
        self.assertEqual(resultado, "msg-id")
        self.assertEqual(op.chamadas, 2)

    def test_sao_tres_envios_no_maximo(self):
        self.assertEqual(len(ESPERAS_DO_EMAIL), 2)


if __name__ == "__main__":
    unittest.main()
