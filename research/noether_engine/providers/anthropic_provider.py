"""Claude provider adapter (official `anthropic` SDK, Messages API).

Model id is configuration (ANTHROPIC_MODEL, default claude-opus-5-5 as listed in
the platform model overview). Notes for this model family from the docs:
thinking cannot be disabled and forced tool use is not supported, so this
adapter sends neither `thinking` nor `tool_choice`, and reads only text blocks.
Agents return JSON that the worker validates; model output is data, never code
or instructions for the worker.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from ..config import PRICING, settings


class ProviderUnconfigured(Exception):
    pass


class ProviderRetryable(Exception):
    pass


@dataclass
class Completion:
    text: str
    input_tokens: int
    output_tokens: int
    usd: float
    model: str
    stop_reason: str | None


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def estimate_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = PRICING.get(model, (4.0, 20.0))
    return input_tokens / 1e6 * pin + output_tokens / 1e6 * pout


def complete(system: str, user: str, *, max_tokens: int = 4000, model: str | None = None, timeout: float = 600) -> Completion:
    if not available():
        raise ProviderUnconfigured("ANTHROPIC_API_KEY is not set")
    import anthropic  # imported lazily so the engine runs without the SDK in demo setups

    model = model or settings().anthropic_model
    client = anthropic.Anthropic(timeout=timeout, max_retries=0)
    try:
        resp = client.messages.create(model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}])
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError, anthropic.APITimeoutError) as e:
        raise ProviderRetryable(str(e)) from e
    except anthropic.AuthenticationError as e:
        raise ProviderUnconfigured(f"authentication failed: {e}") from e
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    u = resp.usage
    return Completion(text, u.input_tokens, u.output_tokens, estimate_usd(model, u.input_tokens, u.output_tokens), model, resp.stop_reason)


def extract_json(text: str) -> dict:
    """Agents are asked for one JSON object; take the last fenced or bare object."""
    blocks = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.S)
    cand = blocks[-1] if blocks else text[text.find("{"): text.rfind("}") + 1]
    obj = json.loads(cand)
    if not isinstance(obj, dict):
        raise ValueError("agent output is not a JSON object")
    return obj
