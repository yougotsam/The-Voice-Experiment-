from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}
MAX_RETRIES = 2
BASE_DELAY = 0.5


async def retry_post(
    client: httpx.AsyncClient,
    url: str,
    *,
    retries: int = MAX_RETRIES,
    **kwargs,
) -> httpx.Response:
    last_exc: Exception | None = None
    response: httpx.Response | None = None
    for attempt in range(retries + 1):
        try:
            response = await client.post(url, **kwargs)
            if response.status_code not in RETRYABLE_STATUSES or attempt == retries:
                return response
            logger.warning(
                "Retryable HTTP %d from %s (attempt %d/%d)",
                response.status_code, url, attempt + 1, retries + 1,
            )
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_exc = exc
            if attempt == retries:
                raise
            logger.warning(
                "HTTP request failed (%s), retrying (attempt %d/%d)",
                exc, attempt + 1, retries + 1,
            )
        await asyncio.sleep(BASE_DELAY * (2 ** attempt))
    if response is not None:
        return response
    raise last_exc  # type: ignore[misc]
