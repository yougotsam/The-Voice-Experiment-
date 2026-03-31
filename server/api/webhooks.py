from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request, Response

from server.config import settings
from server.ws.connections import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _normalize_event(body: dict[str, Any]) -> dict[str, Any] | None:
    event_type = body.get("event") or body.get("type") or body.get("event_type") or ""
    event_type = str(event_type).strip()

    if not event_type:
        event_type = _infer_event_type(body)

    if not event_type:
        return None

    category = _categorize(event_type)
    summary = _build_summary(event_type, category, body)

    return {
        "event_type": event_type,
        "category": category,
        "summary": summary,
        "contact_name": _extract_name(body),
        "details": _extract_details(event_type, body),
    }


def _infer_event_type(body: dict[str, Any]) -> str:
    if "opportunity_name" in body or "pipelineId" in body or "pipeline_name" in body:
        if "stageId" in body or "stage_name" in body:
            return "OpportunityStageUpdate"
        return "OpportunityCreate"
    if "message_body" in body or "messageBody" in body or "lastMessageBody" in body:
        return "InboundMessage"
    if "calendarId" in body or "appointmentStatus" in body or "start_time" in body:
        return "AppointmentCreate"
    if "first_name" in body or "firstName" in body or "contact_id" in body or "contactId" in body:
        return "ContactCreate"
    return ""


_CATEGORY_MAP: dict[str, str] = {
    "ContactCreate": "contact",
    "ContactUpdate": "contact",
    "ContactDelete": "contact",
    "OpportunityCreate": "opportunity",
    "OpportunityStageUpdate": "opportunity",
    "OpportunityStatusUpdate": "opportunity",
    "InboundMessage": "message",
    "OutboundMessage": "message",
    "AppointmentCreate": "appointment",
    "AppointmentUpdate": "appointment",
    "AppointmentDelete": "appointment",
    "NoteCreate": "note",
    "TaskCreate": "task",
    "TaskComplete": "task",
}


def _categorize(event_type: str) -> str:
    return _CATEGORY_MAP.get(event_type, "other")


def _extract_name(body: dict[str, Any]) -> str:
    first = body.get("first_name") or body.get("firstName") or body.get("contact_name") or body.get("contactName") or ""
    last = body.get("last_name") or body.get("lastName") or ""
    name = f"{first} {last}".strip()
    return name or body.get("name") or body.get("opportunity_name") or body.get("title") or "Unknown"


def _extract_details(event_type: str, body: dict[str, Any]) -> dict[str, Any]:
    details: dict[str, Any] = {}

    if "opportunity" in event_type.lower():
        details["pipeline"] = body.get("pipeline_name") or body.get("pipelineName") or ""
        details["stage"] = body.get("stage_name") or body.get("stageName") or ""
        details["status"] = body.get("status") or ""
        val = body.get("monetary_value") or body.get("monetaryValue") or body.get("value")
        if val is not None:
            details["value"] = val

    if "message" in event_type.lower():
        details["message"] = body.get("message_body") or body.get("messageBody") or body.get("lastMessageBody") or ""
        details["message_type"] = body.get("message_type") or body.get("messageType") or ""

    if "appointment" in event_type.lower():
        details["title"] = body.get("title") or ""
        details["start_time"] = body.get("start_time") or body.get("startTime") or ""

    if "contact" in event_type.lower():
        details["email"] = body.get("email") or ""
        details["phone"] = body.get("phone") or ""

    return details


def _build_summary(event_type: str, category: str, body: dict[str, Any]) -> str:
    name = _extract_name(body)

    if category == "contact":
        action = "created" if "Create" in event_type else "updated" if "Update" in event_type else "deleted"
        return f"Contact {action}: {name}"
    if category == "opportunity":
        opp_name = body.get("opportunity_name") or body.get("name") or "Deal"
        if "Stage" in event_type:
            stage = body.get("stage_name") or body.get("stageName") or "new stage"
            return f"{opp_name} moved to {stage}"
        if "Status" in event_type:
            status = body.get("status") or "updated"
            return f"{opp_name}: {status}"
        return f"New opportunity: {opp_name}"
    if category == "message":
        msg_type = body.get("message_type") or body.get("messageType") or "message"
        return f"New {msg_type} from {name}"
    if category == "appointment":
        title = body.get("title") or "Appointment"
        action = "created" if "Create" in event_type else "updated" if "Update" in event_type else "cancelled"
        return f"{title} {action} with {name}"
    if category == "task":
        action = "completed" if "Complete" in event_type else "created"
        return f"Task {action}: {body.get('title') or body.get('name') or 'Untitled'}"

    return f"CRM event: {event_type}"


@router.post("/ghl")
async def ghl_webhook(request: Request) -> Response:
    secret = request.query_params.get("secret", "")
    expected = settings.ghl_webhook_secret
    if expected and secret != expected:
        logger.warning("Webhook rejected: invalid secret")
        return Response(status_code=401)

    try:
        body = await request.json()
    except Exception:
        logger.warning("Webhook received non-JSON payload")
        return Response(status_code=400)

    logger.info("GHL webhook received: %s", {k: v for k, v in body.items() if k in ("event", "type", "event_type")})

    event = _normalize_event(body)
    if event:
        await manager.broadcast("webhook.event", event)
        logger.info("Webhook broadcast: %s", event.get("summary", ""))
    else:
        logger.warning("Could not normalize webhook payload, skipping broadcast")

    return Response(status_code=200, content='{"status":"ok"}', media_type="application/json")
