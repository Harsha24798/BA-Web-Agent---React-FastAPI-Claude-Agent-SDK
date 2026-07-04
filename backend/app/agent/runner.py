"""Run the Claude Agent SDK and extract the SRS JSON, reporting progress via a callback."""
from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from pathlib import Path

logging.getLogger("ba-agent.runner")

# on_event(event_type, payload) where event_type in {"tool_use","text","partial"}
EventCB = Callable[[str, dict], Awaitable[None]]


class AgentError(RuntimeError):
    pass


async def run_agent(
    *,
    system_prompt: str,
    allowed_tools: list[str],
    cwd: Path,
    model: str,
    run_prompt: str,
    on_event: EventCB,
) -> tuple[dict, str | None]:
    """Execute a generation run. Returns (srs_json, sdk_session_id)."""
    from claude_agent_sdk import ClaudeAgentOptions, query

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        allowed_tools=allowed_tools or ["Read", "Glob", "Grep"],
        cwd=str(cwd),
        model=model,
        include_partial_messages=True,
        permission_mode="bypassPermissions",  # headless: never wait for a permission prompt
    )

    text_chunks: list[str] = []
    session_id: str | None = None

    # Hold the async generator so we can close it deterministically (reaping the Claude Code CLI
    # child process) on cancel/error, instead of relying on garbage collection.
    stream = query(prompt=run_prompt, options=options)
    try:
        async for message in stream:
            cls = type(message).__name__

            # capture session id whenever present
            sid = getattr(message, "session_id", None)
            if sid:
                session_id = sid

            if cls == "AssistantMessage":
                for block in getattr(message, "content", []) or []:
                    bname = type(block).__name__
                    if bname == "TextBlock":
                        txt = getattr(block, "text", "") or ""
                        text_chunks.append(txt)
                        if txt.strip():
                            await on_event("text", {"text": txt})
                    elif bname == "ToolUseBlock":
                        tool = getattr(block, "name", "") or ""
                        tinput = getattr(block, "input", {}) or {}
                        await on_event("tool_use", {"name": tool, "input": tinput})
            elif cls in ("StreamEvent", "PartialAssistantMessage"):
                await on_event("partial", {})
            elif cls == "ResultMessage":
                if getattr(message, "is_error", False):
                    raise AgentError(getattr(message, "result", None) or "Agent returned an error")
                result_text = getattr(message, "result", None)
                if isinstance(result_text, str):
                    text_chunks.append(result_text)
    finally:
        aclose = getattr(stream, "aclose", None)
        if aclose is not None:
            try:
                await aclose()
            except Exception:
                pass

    full = "\n".join(text_chunks)
    data = _extract_json(full)
    if data is None:
        raise AgentError("The agent did not return a valid JSON SRS.")
    return data, session_id


def _extract_json(text: str) -> dict | None:
    # Prefer a fenced ```json block; fall back to the last {...} span.
    for pattern in (r"```json\s*(\{.*?\})\s*```", r"```\s*(\{.*?\})\s*```"):
        matches = re.findall(pattern, text, re.DOTALL)
        if matches:
            try:
                return json.loads(matches[-1])
            except json.JSONDecodeError:
                continue
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None
