import logging
from typing import Any

import httpx

from server.tools.base import Tool
from server.config import settings

logger = logging.getLogger(__name__)

GHL_BASE = "https://services.leadconnectorhq.com"


def _ghl_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.ghl_api_key}",
        "Version": "2021-07-28",
        "Accept": "application/json",
    }


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
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GHL_BASE}/contacts/search",
                headers=_ghl_headers(),
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
