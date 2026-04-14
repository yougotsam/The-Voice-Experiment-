import logging
from typing import Any

import httpx

from server.tools.base import Tool
from server.config import settings

logger = logging.getLogger(__name__)

FIRECRAWL_BASE = "https://api.firecrawl.dev/v1"


class FirecrawlSearch(Tool):
    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Search the web for current information using a query. "
            "Returns relevant web page titles, URLs, and content snippets. "
            "Use this when the user asks about current events, facts, "
            "research topics, or anything requiring up-to-date web data."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to look up on the web.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of results to return (default 5).",
                },
            },
            "required": ["query"],
        }

    async def execute(self, **kwargs) -> dict[str, Any]:
        query = kwargs.get("query", "")
        if not query:
            return {"error": "No search query provided"}

        api_key = settings.firecrawl_api_key
        if not api_key:
            return {"error": "FireCrawl API key not configured"}

        limit = max(1, min(int(kwargs.get("limit", 5)), 10))
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{FIRECRAWL_BASE}/search",
                    json={"query": query, "limit": limit},
                    headers=headers,
                    timeout=30.0,
                )
                if resp.status_code == 401:
                    return {"error": "FireCrawl API key is invalid or expired"}
                if resp.status_code == 429:
                    return {"error": "Web search rate limited. Try again shortly."}
                resp.raise_for_status()
                data = resp.json()
                results = data.get("data", [])
                return {
                    "results": [
                        {
                            "title": r.get("metadata", {}).get("title", ""),
                            "url": r.get("metadata", {}).get("sourceURL", r.get("url", "")),
                            "snippet": (r.get("markdown", "") or "")[:500],
                        }
                        for r in results
                    ],
                    "total": len(results),
                    "query": query,
                }
        except httpx.TimeoutException:
            return {"error": "Web search timed out. Try a simpler query."}
        except Exception:
            logger.exception("FireCrawl search failed")
            return {"error": "Web search failed due to an unexpected error. Please try again."}


class FirecrawlScrape(Tool):
    @property
    def name(self) -> str:
        return "scrape_page"

    @property
    def description(self) -> str:
        return (
            "Scrape and extract the main content from a specific web page URL. "
            "Returns the page content in readable text. Use this after web_search "
            "to read the full content of a specific result."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL of the web page to scrape.",
                },
            },
            "required": ["url"],
        }

    async def execute(self, **kwargs) -> dict[str, Any]:
        url = kwargs.get("url", "")
        if not url:
            return {"error": "No URL provided"}

        api_key = settings.firecrawl_api_key
        if not api_key:
            return {"error": "FireCrawl API key not configured"}

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{FIRECRAWL_BASE}/scrape",
                    json={"url": url, "formats": ["markdown"]},
                    headers=headers,
                    timeout=30.0,
                )
                if resp.status_code == 401:
                    return {"error": "FireCrawl API key is invalid or expired"}
                if resp.status_code == 429:
                    return {"error": "Page scraping rate limited. Try again shortly."}
                resp.raise_for_status()
                data = resp.json()
                content = data.get("data", {}).get("markdown", "")
                title = data.get("data", {}).get("metadata", {}).get("title", "")
                return {
                    "title": title,
                    "url": url,
                    "content": content[:3000],
                }
        except httpx.TimeoutException:
            return {"error": "Page scraping timed out."}
        except Exception:
            logger.exception("FireCrawl scrape failed")
            return {"error": "Page scraping failed due to an unexpected error. Please try again."}
