from __future__ import annotations

import logging
import re

from server.agents.base import AgentConfig
from server.agents.registry import AGENT_REGISTRY, get_agent
from server.llm.base import LLMProvider

logger = logging.getLogger(__name__)

ROUTER_PROMPT = (
    "You are an intent classifier. Given the user's message, classify it into exactly one category.\n"
    "Respond with ONLY the category id, nothing else.\n\n"
    "Categories:\n"
    "- crm: Contact lookup, creating contacts, pipeline/opportunity management\n"
    "- comms: Sending SMS, sending email, viewing conversation history\n"
    "- calendar: Checking calendar, scheduling, availability\n"
    "- creative: Drafting content, blog posts, social media, email copy, ad scripts, generating images\n"
    "- research: Web search, looking up information online, researching topics, current events, fact-checking, news\n"
    "- default: General conversation, strategy, coaching, questions, greetings, or anything else\n\n"
    "User message: {message}\n\n"
    "Category:"
)

_TASK_KEYWORDS = re.compile(
    r"\b(contact|pipeline|opportunit|deal|sms|text|email|send|calendar|schedule|"
    r"event|draft|blog|post|caption|content|write|compose|search|find|create|look\s*up|"
    r"image|picture|draw|illustrat|visualize|generate|graphic|design|"
    r"research|browse|scrape|news|article|website|latest|current)\b",
    re.IGNORECASE,
)

_VALID_IDS = set(AGENT_REGISTRY.keys())


class AgentRouter:
    def should_route(self, message: str) -> bool:
        words = message.split()
        if len(words) < 3:
            return False
        return bool(_TASK_KEYWORDS.search(message))

    async def classify(self, message: str, llm: LLMProvider) -> AgentConfig:
        try:
            prompt = ROUTER_PROMPT.format(message=message[:500])
            response = ""
            async for token in llm.stream_chat(
                [{"role": "user", "content": prompt}],
                system_prompt="You are a classification assistant. Respond with only the category id.",
                max_tokens=32,
            ):
                if isinstance(token, str):
                    response += token
            agent_id = response.strip().lower().rstrip(".")
            if agent_id in _VALID_IDS:
                logger.info("Router classified as '%s' for: %s", agent_id, message[:80])
                return get_agent(agent_id)
            logger.warning("Router returned unknown id '%s', falling back to default", agent_id)
        except Exception:
            logger.exception("Router classification failed, falling back to default")
        return get_agent("default")
