from __future__ import annotations

from server.agents.base import AgentConfig

AGENT_REGISTRY: dict[str, AgentConfig] = {}


def _register(*agents: AgentConfig) -> None:
    for a in agents:
        AGENT_REGISTRY[a.id] = a


_register(
    AgentConfig(
        id="crm",
        name="CRM Agent",
        description="Manages contacts, pipelines, and opportunities in the CRM.",
        system_prompt_addon=(
            "You are specialized in CRM operations. Focus on contact management, "
            "pipeline tracking, and opportunity handling. Be precise with data and "
            "confirm actions before executing them."
        ),
        tools=[
            "search_contacts",
            "create_contact",
            "get_pipelines",
            "create_opportunity",
            "move_opportunity",
        ],
        integration_name="GoHighLevel CRM",
    ),
    AgentConfig(
        id="comms",
        name="Comms Agent",
        description="Handles outbound messaging — SMS, email, and conversation history.",
        system_prompt_addon=(
            "You are specialized in communications. Help compose and send messages "
            "via SMS and email. Review conversation history when relevant. Always "
            "confirm the recipient and content before sending."
        ),
        tools=[
            "send_sms",
            "send_email",
            "get_conversations",
        ],
        integration_name="GoHighLevel CRM",
    ),
    AgentConfig(
        id="calendar",
        name="Calendar Agent",
        description="Retrieves and manages calendar events and scheduling.",
        system_prompt_addon=(
            "You are specialized in scheduling. Help retrieve calendar events "
            "and answer questions about availability and upcoming appointments."
        ),
        tools=[
            "get_calendar_events",
        ],
        integration_name="GoHighLevel CRM",
    ),
    AgentConfig(
        id="creative",
        name="Creative Agent",
        description="Drafts content — blog posts, social captions, email copy, ad scripts.",
        system_prompt_addon=(
            "You are a creative content specialist. Help draft compelling content "
            "tailored to the user's brand voice and audience. Focus on quality, "
            "clarity, and engagement."
        ),
        tools=[
            "draft_content",
        ],
    ),
    AgentConfig(
        id="default",
        name="General Assistant",
        description="General conversation, strategy, and coaching. Has access to all tools.",
        system_prompt_addon="",
        tools=[],
    ),
)


def get_agent(agent_id: str) -> AgentConfig:
    return AGENT_REGISTRY.get(agent_id, AGENT_REGISTRY["default"])


def list_agents() -> list[dict[str, str]]:
    return [{"id": a.id, "name": a.name, "description": a.description} for a in AGENT_REGISTRY.values()]
