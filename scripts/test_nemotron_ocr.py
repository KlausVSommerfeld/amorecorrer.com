# test_nemotron_ocr.py
import base64
import requests
import os

API_KEY = os.environ["NVIDIA_NIM_API_KEY"]  # gerado em build.nvidia.com
IMAGE_PATH = "amostras/multa_01.jpg"

with open(IMAGE_PATH, "rb") as f:
    b64_image = base64.b64encode(f.read()).decode()

payload = {
    "input": [
        {"type": "image_url", "url": f"data:image/jpeg;base64,{b64_image}"}
    ]
}

resp = requests.post(
    "https://ai.api.nvidia.com/v1/nemotron-ocr-v2/infer",  # endpoint hospedado — confirme a URL exata no dashboard, a doc mostra o formato do payload mas não o endpoint hospedado explicitamente
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json=payload,
    timeout=30,
)
resp.raise_for_status()
print(resp.json())