import httpx
from typing import Optional

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:latest"
TIMEOUT = 30.0


async def generate(prompt: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "").strip() or None
    except Exception:
        return None
