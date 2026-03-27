import logging
from typing import Any

import httpx

from server.tools.base import Tool
from server.config import settings

logger = logging.getLogger(__name__)

GHL_BASE = "https://services.leadconnectorhq.com"

_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=10.0,
            headers={
                "Authorization": f"Bearer {settings.ghl_api_key}",
                "Version": "2021-07-28",
                "Accept": "application/json",
            },
        )
    return _http_client


async def close_ghl_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


class GHLContactSearch(Tool):
    name = "search_contacts"
    description = (
        "Search for contacts in GoHighLevel CRM by name, email, or phone number. "
        "Returns matching contact profiles with their details."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query — a name, email, or phone number",
            },
        },
        "required": ["query"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        query = kwargs.get("query")
        if not query:
            return {"error": "Missing required argument: query"}
        client = _get_client()
        resp = await client.get(
            f"{GHL_BASE}/contacts/search",
            params={"locationId": settings.ghl_location_id, "query": query},
        )
        if resp.status_code != 200:
            logger.error("GHL contacts search %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        contacts = data.get("contacts", [])
        results = []
        for c in contacts[:5]:
            results.append({
                "id": c.get("id"),
                "name": f'{c.get("firstName", "")} {c.get("lastName", "")}'.strip(),
                "email": c.get("email"),
                "phone": c.get("phone"),
                "tags": c.get("tags", []),
            })
        return {"contacts": results, "total": len(contacts)}


class GHLDraftContent(Tool):
    name = "draft_content"
    description = (
        "Draft creative content such as blog posts, social captions, email copy, "
        "or ad scripts. Returns the generated text for review. This does NOT "
        "publish anything -- it only produces a draft."
    )
    parameters = {
        "type": "object",
        "properties": {
            "content_type": {
                "type": "string",
                "description": "Type of content: blog, caption, email, ad, script, or other",
            },
            "topic": {
                "type": "string",
                "description": "Subject or topic of the content",
            },
            "tone": {
                "type": "string",
                "description": "Desired tone: professional, casual, bold, empathetic, etc.",
            },
            "length": {
                "type": "string",
                "description": "Desired length: short, medium, long",
            },
        },
        "required": ["content_type", "topic"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        content_type = kwargs.get("content_type", "content")
        topic = kwargs.get("topic", "")
        tone = kwargs.get("tone", "professional")
        length = kwargs.get("length", "medium")
        return {
            "draft_type": content_type,
            "topic": topic,
            "tone": tone,
            "length": length,
            "status": "ready_for_generation",
            "note": "Draft parameters captured. The LLM will generate the content inline.",
        }


class GHLGetCalendarEvents(Tool):
    name = "get_calendar_events"
    description = (
        "Retrieve upcoming calendar events from GoHighLevel. "
        "Returns scheduled appointments and their details."
    )
    parameters = {
        "type": "object",
        "properties": {
            "start_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format (defaults to today)",
            },
            "end_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format (defaults to 7 days from start)",
            },
        },
        "required": [],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        from datetime import datetime, timedelta

        start = kwargs.get("start_date", datetime.utcnow().strftime("%Y-%m-%d"))
        end = kwargs.get("end_date")
        if not end:
            end = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=7)).strftime("%Y-%m-%d")

        client = _get_client()
        resp = await client.get(
            f"{GHL_BASE}/calendars/events",
            params={
                "locationId": settings.ghl_location_id,
                "startTime": f"{start}T00:00:00Z",
                "endTime": f"{end}T23:59:59Z",
            },
        )
        if resp.status_code != 200:
            logger.error("GHL calendar events %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        events = data.get("events", [])
        results = []
        for ev in events[:10]:
            results.append({
                "id": ev.get("id"),
                "title": ev.get("title", "Untitled"),
                "start": ev.get("startTime"),
                "end": ev.get("endTime"),
                "status": ev.get("status"),
                "contact_id": ev.get("contactId"),
            })
        return {"events": results, "total": len(events)}


class GHLMoveOpportunity(Tool):
    name = "move_opportunity"
    description = (
        "Move an opportunity to a different pipeline stage in GoHighLevel. "
        "Use this to update deal status or advance a lead through the pipeline."
    )
    parameters = {
        "type": "object",
        "properties": {
            "opportunity_id": {
                "type": "string",
                "description": "The ID of the opportunity to move",
            },
            "pipeline_stage_id": {
                "type": "string",
                "description": "The target pipeline stage ID",
            },
            "status": {
                "type": "string",
                "description": "New status: open, won, lost, or abandoned",
            },
        },
        "required": ["opportunity_id"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        opp_id = kwargs.get("opportunity_id")
        if not opp_id:
            return {"error": "Missing required argument: opportunity_id"}

        body: dict[str, Any] = {}
        if kwargs.get("pipeline_stage_id"):
            body["pipelineStageId"] = kwargs["pipeline_stage_id"]
        if kwargs.get("status"):
            body["status"] = kwargs["status"]

        if not body:
            return {"error": "Provide at least one of: pipeline_stage_id, status"}

        client = _get_client()
        resp = await client.put(
            f"{GHL_BASE}/opportunities/{opp_id}",
            json=body,
        )
        if resp.status_code != 200:
            logger.error("GHL move opportunity %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        opp = data.get("opportunity", data)
        return {
            "id": opp.get("id"),
            "name": opp.get("name"),
            "status": opp.get("status"),
            "stage": opp.get("pipelineStageName", opp.get("pipelineStageId")),
        }
