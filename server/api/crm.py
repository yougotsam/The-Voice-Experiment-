import logging

from fastapi import APIRouter, HTTPException

from server.config import settings
from server.tools.ghl import GHL_BASE, _get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm"])


def _require_ghl() -> None:
    if not settings.ghl_api_key or not settings.ghl_location_id:
        raise HTTPException(status_code=503, detail="GHL credentials not configured")


@router.get("/contacts")
async def list_contacts(query: str = "", limit: int = 20):
    _require_ghl()
    limit = max(1, min(limit, 50))
    client = _get_client()

    if query:
        resp = await client.get(
            f"{GHL_BASE}/contacts/search",
            params={"locationId": settings.ghl_location_id, "query": query, "limit": limit},
        )
    else:
        resp = await client.get(
            f"{GHL_BASE}/contacts/",
            params={"locationId": settings.ghl_location_id, "limit": limit, "sortBy": "date_added", "order": "desc"},
        )

    if resp.status_code != 200:
        logger.error("CRM contacts %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=resp.status_code, detail="Failed to fetch contacts")
    data = resp.json()

    contacts = data.get("contacts", [])
    results = []
    for c in contacts[:limit]:
        results.append({
            "id": c.get("id"),
            "name": f'{c.get("firstName", "")} {c.get("lastName", "")}'.strip(),
            "email": c.get("email", ""),
            "phone": c.get("phone", ""),
            "tags": c.get("tags", []),
            "dateAdded": c.get("dateAdded", ""),
        })
    return {"contacts": results, "total": len(contacts)}


@router.get("/pipelines")
async def list_pipelines():
    _require_ghl()
    client = _get_client()
    resp = await client.get(
        f"{GHL_BASE}/opportunities/pipelines",
        params={"locationId": settings.ghl_location_id},
    )
    if resp.status_code != 200:
        logger.error("CRM pipelines %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=resp.status_code, detail="Failed to fetch pipelines")
    data = resp.json()

    pipelines = data.get("pipelines", [])
    results = []
    for p in pipelines:
        stages = []
        for s in p.get("stages", []):
            stages.append({"id": s.get("id"), "name": s.get("name")})
        results.append({"id": p.get("id"), "name": p.get("name"), "stages": stages})
    return {"pipelines": results}


@router.get("/opportunities")
async def list_opportunities(pipeline_id: str = "", limit: int = 20):
    _require_ghl()
    limit = max(1, min(limit, 50))
    client = _get_client()
    params: dict = {"locationId": settings.ghl_location_id, "limit": limit, "order": "desc"}
    if pipeline_id:
        params["pipelineId"] = pipeline_id
    resp = await client.get(f"{GHL_BASE}/opportunities/search", params=params)
    if resp.status_code != 200:
        logger.error("CRM opportunities %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=resp.status_code, detail="Failed to fetch opportunities")
    data = resp.json()

    opportunities = data.get("opportunities", [])
    results = []
    for o in opportunities[:limit]:
        results.append({
            "id": o.get("id"),
            "name": o.get("name", "Untitled"),
            "status": o.get("status", "open"),
            "stage": o.get("pipelineStageName", o.get("pipelineStageId", "")),
            "monetaryValue": o.get("monetaryValue", 0),
            "contactName": o.get("contact", {}).get("name", ""),
            "dateAdded": o.get("createdAt", ""),
        })
    return {"opportunities": results, "total": len(opportunities)}


@router.get("/conversations")
async def list_conversations(limit: int = 15):
    _require_ghl()
    limit = max(1, min(limit, 30))
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
        logger.error("CRM conversations %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=resp.status_code, detail="Failed to fetch conversations")
    data = resp.json()

    conversations = data.get("conversations", [])
    results = []
    for conv in conversations[:limit]:
        results.append({
            "id": conv.get("id"),
            "contactId": conv.get("contactId", ""),
            "contactName": conv.get("contactName", conv.get("fullName", "")),
            "lastMessage": conv.get("lastMessageBody", "")[:200],
            "lastMessageType": conv.get("lastMessageType", ""),
            "lastMessageDate": conv.get("lastMessageDate", ""),
            "unreadCount": conv.get("unreadCount", 0),
        })
    return {"conversations": results, "total": len(conversations)}
