import time
import logging
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

logger = logging.getLogger(__name__)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "microphone=(self), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 120, trust_proxy_headers: bool = False):
        super().__init__(app)
        self._rpm = requests_per_minute
        self._window = 60.0
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._trust_proxy_headers = trust_proxy_headers

    def _get_client_ip(self, request: Request) -> str:
        client_ip = request.client.host if request.client else "unknown"
        if not self._trust_proxy_headers:
            return client_ip
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return client_ip

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in ("/health", "/ws") or request.method == "OPTIONS":
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        now = time.monotonic()

        timestamps = self._hits[client_ip]
        cutoff = now - self._window
        pruned = [t for t in timestamps if t > cutoff]
        if pruned:
            self._hits[client_ip] = pruned
        else:
            self._hits.pop(client_ip, None)

        if len(pruned) >= self._rpm:
            logger.warning("Rate limit exceeded for %s on %s", client_ip, request.url.path)
            return JSONResponse(
                {"detail": "Rate limit exceeded. Try again shortly."},
                status_code=429,
                headers={"Retry-After": "60"},
            )

        self._hits[client_ip].append(now)
        return await call_next(request)
