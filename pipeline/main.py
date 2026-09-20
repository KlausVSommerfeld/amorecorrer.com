"""
HTTP entry for the dispatch pipeline (replacement for n8n webhook).

Run from `pipeline/` (cwd): python -m uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import Response

from worker import run_dispatch_pipeline, verify_incoming_hmac

log = logging.getLogger(__name__)
app = FastAPI(title="Amo Recorrer dispatch pipeline", version="1.0")


@app.post("/hooks/dispatch")
async def dispatch_hook(request: Request, background_tasks: BackgroundTasks) -> Response:
    raw_bytes = await request.body()
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail="invalid body encoding") from e

    sig = request.headers.get("x-signature")
    ok = verify_incoming_hmac(text, sig)
    if not ok:
        raise HTTPException(status_code=401, detail="invalid signature")

    background_tasks.add_task(run_dispatch_pipeline, text)
    log.info("dispatch accepted (202), background pipeline scheduled")
    return Response(status_code=202)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
