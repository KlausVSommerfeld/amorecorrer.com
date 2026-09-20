import asyncio
import os
from email.message import EmailMessage

import aiosmtplib
from dotenv import load_dotenv


async def test() -> None:
    load_dotenv()

    msg = EmailMessage()
    msg["From"] = os.environ["MAIL_FROM"]
    msg["To"] = os.environ["SMTP_TEST_TO"]
    msg["Subject"] = "Teste Resend SMTP"
    msg.set_content("Funcionou.")

    await aiosmtplib.send(
        msg,
        hostname=os.environ.get("SMTP_HOST", "smtp.resend.com"),
        port=int(os.environ.get("SMTP_PORT", "587")),
        username=os.environ.get("SMTP_USER", "resend"),
        password=os.environ["SMTP_PASSWORD"],
        start_tls=True,
    )
    print("OK")


asyncio.run(test())
