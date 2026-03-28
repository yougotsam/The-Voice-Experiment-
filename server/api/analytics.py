import logging

from fastapi import APIRouter, HTTPException
from httpx import RequestError

from server.config import settings
from server.tools.ghl import GHL_BASE, _get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _require_ghl() -> None:
    if not settings.ghl_api_key or not settings.ghl_location_id:
        raise HTTPException(status_code=503, detail="GHL credentials not configured")


@router.get("/business")
async def business_metrics():
    _require_ghl()
    client = _get_client()
    result: dict = {}

    try:
        contacts_resp = await client.get(
            f"{GHL_BASE}/contacts/",
            params={"locationId": settings.ghl_location_id, "limit": 1},
        )
        if contacts_resp.status_code == 200:
            data = contacts_resp.json()
            result["total_contacts"] = data.get("meta", {}).get("total") or len(data.get("contacts") or [])
        else:
            result["total_contacts"] = 0
    except RequestError:
        result["total_contacts"] = 0

    try:
        opps: list = []
        params: dict = {"locationId": settings.ghl_location_id, "limit": 100, "order": "desc"}
        for _ in range(10):
            opps_resp = await client.get(f"{GHL_BASE}/opportunities/search", params=params)
            if opps_resp.status_code != 200:
                break
            page = opps_resp.json()
            opps.extend(page.get("opportunities") or [])
            next_cursor = page.get("meta", {}).get("nextPageUrl") or page.get("meta", {}).get("nextAfter")
            if not next_cursor:
                break
            params["startAfter"] = next_cursor
            params["startAfterId"] = next_cursor
        if opps:
            total_value = 0.0
            won = 0
            lost = 0
            open_count = 0
            for o in opps:
                monetary = o.get("monetaryValue")
                if monetary is not None:
                    total_value += float(monetary)
                status = o.get("status") or "open"
                if status == "won":
                    won += 1
                elif status == "lost":
                    lost += 1
                else:
                    open_count += 1
            total_opps = won + lost + open_count
            result["pipeline"] = {
                "total_opportunities": total_opps,
                "total_value": round(total_value, 2),
                "won": won,
                "lost": lost,
                "open": open_count,
                "win_rate": round(won / (won + lost) * 100) if (won + lost) > 0 else 0,
            }
        else:
            result["pipeline"] = {"total_opportunities": 0, "total_value": 0, "won": 0, "lost": 0, "open": 0, "win_rate": 0}
    except RequestError:
        result["pipeline"] = {"total_opportunities": 0, "total_value": 0, "won": 0, "lost": 0, "open": 0, "win_rate": 0}

    return result
