"""
AI SOC analyst — Phase 4.

Thin wrapper over NVIDIA NIM (build.nvidia.com), which exposes an
OpenAI-compatible REST endpoint. We use it to turn a raw alert + its telemetry
into a plain-English explanation with likely intent and a recommended action.

Config (env):
  NVIDIA_API_KEY  — required to enable AI features (get one at build.nvidia.com)
  NVIDIA_MODEL    — model id (default: meta/llama-3.1-8b-instruct)
  NVIDIA_BASE_URL — default: https://integrate.api.nvidia.com/v1
"""
import os

from openai import OpenAI

API_KEY = os.environ.get("NVIDIA_API_KEY", "").strip()
MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")

_client: OpenAI | None = None


def is_enabled() -> bool:
    return bool(API_KEY)


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(base_url=BASE_URL, api_key=API_KEY)
    return _client


SYSTEM_PROMPT = (
    "You are a senior SOC (Security Operations Center) analyst for Linux hosts. "
    "You receive one security alert and its raw telemetry. Respond with THREE "
    "short labeled sections, no preamble:\n"
    "ASSESSMENT: one or two sentences on what likely happened and why it matters.\n"
    "MITRE: the most relevant ATT&CK technique id and name.\n"
    "ACTION: one concrete, human-approved response step.\n"
    "Be concise and specific. Do not invent data not present in the telemetry."
)


def explain_alert(alert: dict, event_payload: dict | None) -> str:
    """Return a natural-language analyst explanation for one alert."""
    user_msg = (
        f"ALERT\n"
        f"- host: {alert.get('hostname')}\n"
        f"- severity: {alert.get('severity')}\n"
        f"- title: {alert.get('title')}\n"
        f"- description: {alert.get('description')}\n"
        f"- heuristic MITRE: {alert.get('mitre_technique')}\n"
        f"- automotive standard: {alert.get('standard_ref') or 'n/a'}\n\n"
        f"RAW TELEMETRY\n{event_payload}"
    )
    resp = _get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=1024,  # headroom for reasoning models that "think" before answering
    )
    msg = resp.choices[0].message
    # Reasoning models split thinking (reasoning_content) from the final answer.
    content = (msg.content or "").strip()
    if not content:
        content = (getattr(msg, "reasoning_content", "") or "").strip()
    return content or "(model returned no content)"


INSIGHTS_PROMPT = (
    "You are a friendly security assistant explaining a device's telemetry to a "
    "NON-TECHNICAL person. You are given a plain summary of one data category. "
    "Reply with exactly three short labeled sections, no preamble, no jargon:\n"
    "SUMMARY: one sentence on what this data shows right now.\n"
    "CONCERN: one sentence — is anything worrying, yes or no, and what.\n"
    "ADVICE: one short, practical next step in plain language.\n"
    "Keep each section to one sentence. Avoid technical terms."
)


def insights(context: str, summary: dict) -> str:
    """Plain-English insight for a whole page/tab, from a small stats summary."""
    lines = "\n".join(f"- {k}: {v}" for k, v in summary.items())
    user_msg = f"DATA CATEGORY: {context}\nSUMMARY OF WHAT WE OBSERVED:\n{lines}"
    resp = _get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": INSIGHTS_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=700,
    )
    msg = resp.choices[0].message
    content = (msg.content or "").strip()
    if not content:
        content = (getattr(msg, "reasoning_content", "") or "").strip()
    return content or "(model returned no content)"
