import logging
import re
import ssl
from typing import Any

import certifi
import httpx

from server.tools.base import Tool
from server.config import settings

logger = logging.getLogger(__name__)

GHL_BASE = "https://services.leadconnectorhq.com"

_PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        _http_client = httpx.AsyncClient(
            timeout=10.0,
            verify=ssl_ctx,
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
                "tags": c.get("tags") or [],
            })
        return {"contacts": results, "total": len(contacts), "returned": len(results)}


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
        from datetime import datetime, timedelta, timezone

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        start = kwargs.get("start_date", now_str)
        end = kwargs.get("end_date")

        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
        except ValueError:
            return {"error": f"Invalid start_date format: '{start}'. Use YYYY-MM-DD."}

        if end:
            try:
                datetime.strptime(end, "%Y-%m-%d")
            except ValueError:
                return {"error": f"Invalid end_date format: '{end}'. Use YYYY-MM-DD."}
        else:
            end = (start_dt + timedelta(days=7)).strftime("%Y-%m-%d")

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
        return {"events": results, "total": len(events), "returned": len(results)}


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


class GHLCreateContact(Tool):
    name = "create_contact"
    description = (
        "Create a new contact in GoHighLevel CRM. "
        "Requires at least a first name and one of: email, phone."
    )
    parameters = {
        "type": "object",
        "properties": {
            "first_name": {
                "type": "string",
                "description": "Contact's first name",
            },
            "last_name": {
                "type": "string",
                "description": "Contact's last name",
            },
            "email": {
                "type": "string",
                "description": "Contact's email address",
            },
            "phone": {
                "type": "string",
                "description": "Contact's phone number (E.164 format preferred, e.g. +15551234567)",
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tags to apply to the contact",
            },
        },
        "required": ["first_name"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        first_name = kwargs.get("first_name", "").strip()
        if not first_name:
            return {"error": "Missing required argument: first_name"}

        email = kwargs.get("email", "").strip()
        phone = kwargs.get("phone", "").strip()
        if not email and not phone:
            return {"error": "At least one of email or phone is required"}

        if email and not _EMAIL_RE.match(email):
            return {"error": f"Invalid email format: '{email}'"}
        if phone and not _PHONE_RE.match(phone):
            return {"error": f"Invalid phone format: '{phone}'. Use E.164 (e.g. +15551234567)"}

        body: dict[str, Any] = {
            "firstName": first_name,
            "locationId": settings.ghl_location_id,
        }
        if kwargs.get("last_name"):
            body["lastName"] = kwargs["last_name"].strip()
        if email:
            body["email"] = email
        if phone:
            body["phone"] = phone
        if kwargs.get("tags"):
            body["tags"] = kwargs["tags"]

        client = _get_client()
        resp = await client.post(f"{GHL_BASE}/contacts/", json=body)
        if resp.status_code not in (200, 201):
            logger.error("GHL create contact %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        contact = data.get("contact", data)
        return {
            "id": contact.get("id"),
            "name": f'{contact.get("firstName", "")} {contact.get("lastName", "")}'.strip(),
            "email": contact.get("email"),
            "phone": contact.get("phone"),
        }


class GHLSendSMS(Tool):
    name = "send_sms"
    description = (
        "Send an SMS message to a contact via GoHighLevel. "
        "Requires the contact ID and the message body."
    )
    parameters = {
        "type": "object",
        "properties": {
            "contact_id": {
                "type": "string",
                "description": "The GHL contact ID to send the SMS to",
            },
            "message": {
                "type": "string",
                "description": "The SMS message body (max 1600 characters)",
            },
        },
        "required": ["contact_id", "message"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        contact_id = kwargs.get("contact_id", "").strip()
        message = kwargs.get("message", "").strip()
        if not contact_id:
            return {"error": "Missing required argument: contact_id"}
        if not message:
            return {"error": "Missing required argument: message"}
        if len(message) > 1600:
            return {"error": f"Message too long ({len(message)} chars). Max 1600."}

        client = _get_client()
        resp = await client.post(
            f"{GHL_BASE}/conversations/messages",
            json={
                "type": "SMS",
                "contactId": contact_id,
                "message": message,
            },
        )
        if resp.status_code not in (200, 201):
            logger.error("GHL send SMS %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        msg = data.get("message", data)
        return {
            "id": msg.get("id", msg.get("messageId")),
            "status": msg.get("status", "sent"),
            "contact_id": contact_id,
        }


class GHLSendEmail(Tool):
    name = "send_email"
    description = (
        "Send an email to a contact via GoHighLevel. "
        "Requires the contact ID, subject, and HTML body."
    )
    parameters = {
        "type": "object",
        "properties": {
            "contact_id": {
                "type": "string",
                "description": "The GHL contact ID to send the email to",
            },
            "subject": {
                "type": "string",
                "description": "Email subject line",
            },
            "body": {
                "type": "string",
                "description": "Email body content (plain text — will be wrapped in HTML)",
            },
        },
        "required": ["contact_id", "subject", "body"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        contact_id = kwargs.get("contact_id", "").strip()
        subject = kwargs.get("subject", "").strip()
        body = kwargs.get("body", "").strip()
        if not contact_id:
            return {"error": "Missing required argument: contact_id"}
        if not subject:
            return {"error": "Missing required argument: subject"}
        if not body:
            return {"error": "Missing required argument: body"}

        import html
        html_body = html.escape(body).replace("\n", "<br>")

        client = _get_client()
        resp = await client.post(
            f"{GHL_BASE}/conversations/messages",
            json={
                "type": "Email",
                "contactId": contact_id,
                "subject": subject,
                "html": f"<p>{html_body}</p>",
                "message": body,
            },
        )
        if resp.status_code not in (200, 201):
            logger.error("GHL send email %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        msg = data.get("message", data)
        return {
            "id": msg.get("id", msg.get("messageId")),
            "status": msg.get("status", "sent"),
            "contact_id": contact_id,
            "subject": subject,
        }


class GHLGetPipelines(Tool):
    name = "get_pipelines"
    description = (
        "List all sales pipelines and their stages from GoHighLevel. "
        "Use this to find pipeline and stage IDs for creating or moving opportunities."
    )
    parameters = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        client = _get_client()
        resp = await client.get(
            f"{GHL_BASE}/opportunities/pipelines",
            params={"locationId": settings.ghl_location_id},
        )
        if resp.status_code != 200:
            logger.error("GHL get pipelines %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        pipelines = data.get("pipelines", [])
        results = []
        for p in pipelines:
            stages = []
            for s in p.get("stages", []):
                stages.append({
                    "id": s.get("id"),
                    "name": s.get("name"),
                })
            results.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "stages": stages,
            })
        return {"pipelines": results, "total": len(results)}


class GHLCreateOpportunity(Tool):
    name = "create_opportunity"
    description = (
        "Create a new opportunity (deal) in a GoHighLevel pipeline. "
        "Requires a name, pipeline ID, and stage ID. Optionally link to a contact."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Name of the opportunity/deal",
            },
            "pipeline_id": {
                "type": "string",
                "description": "Pipeline ID (use get_pipelines to find this)",
            },
            "stage_id": {
                "type": "string",
                "description": "Pipeline stage ID to place the opportunity in",
            },
            "contact_id": {
                "type": "string",
                "description": "Contact ID to associate with this opportunity",
            },
            "monetary_value": {
                "type": "number",
                "description": "Deal value in dollars",
            },
            "status": {
                "type": "string",
                "description": "Status: open, won, lost, or abandoned (defaults to open)",
            },
        },
        "required": ["name", "pipeline_id", "stage_id"],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        name = kwargs.get("name", "").strip()
        pipeline_id = kwargs.get("pipeline_id", "").strip()
        stage_id = kwargs.get("stage_id", "").strip()
        if not name:
            return {"error": "Missing required argument: name"}
        if not pipeline_id:
            return {"error": "Missing required argument: pipeline_id"}
        if not stage_id:
            return {"error": "Missing required argument: stage_id"}

        body: dict[str, Any] = {
            "name": name,
            "pipelineId": pipeline_id,
            "pipelineStageId": stage_id,
            "locationId": settings.ghl_location_id,
            "status": kwargs.get("status", "open"),
        }
        if kwargs.get("contact_id"):
            body["contactId"] = kwargs["contact_id"]
        if kwargs.get("monetary_value") is not None:
            body["monetaryValue"] = kwargs["monetary_value"]

        client = _get_client()
        resp = await client.post(f"{GHL_BASE}/opportunities/", json=body)
        if resp.status_code not in (200, 201):
            logger.error("GHL create opportunity %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        opp = data.get("opportunity", data)
        return {
            "id": opp.get("id"),
            "name": opp.get("name"),
            "status": opp.get("status"),
            "stage": opp.get("pipelineStageName", opp.get("pipelineStageId")),
            "monetary_value": opp.get("monetaryValue"),
        }


class GHLGetConversations(Tool):
    name = "get_conversations"
    description = (
        "List recent conversations (SMS, email, etc.) from GoHighLevel. "
        "Returns the most recent conversation threads with their last message."
    )
    parameters = {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Number of conversations to return (max 20, default 10)",
            },
        },
        "required": [],
    }

    async def execute(self, **kwargs) -> dict[str, Any]:
        try:
            limit = max(1, min(int(kwargs.get("limit", 10)), 20))
        except (TypeError, ValueError):
            limit = 10

        client = _get_client()
        resp = await client.get(
            f"{GHL_BASE}/conversations/search",
            params={
                "locationId": settings.ghl_location_id,
                "limit": limit,
                "sort": "desc",
                "sortBy": "last_message_date",
            },
        )
        if resp.status_code != 200:
            logger.error("GHL get conversations %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()

        conversations = data.get("conversations", [])
        results = []
        for conv in conversations[:limit]:
            results.append({
                "id": conv.get("id"),
                "contact_id": conv.get("contactId"),
                "contact_name": conv.get("contactName", conv.get("fullName", "")),
                "last_message": conv.get("lastMessageBody", "")[:200],
                "last_message_type": conv.get("lastMessageType"),
                "last_message_date": conv.get("lastMessageDate"),
                "unread_count": conv.get("unreadCount", 0),
            })
        return {"conversations": results, "total": len(conversations), "returned": len(results)}
