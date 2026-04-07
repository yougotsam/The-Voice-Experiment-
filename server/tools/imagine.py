import logging
from typing import Any

import httpx

from server.tools.base import Tool
from server.config import settings

logger = logging.getLogger(__name__)

GROK_IMAGE_URL = "https://api.x.ai/v1/images/generations"


class GrokImagine(Tool):
    @property
    def name(self) -> str:
        return "generate_image"

    @property
    def description(self) -> str:
        return (
            "Generate an image using Grok's image generation model. "
            "Use this when the user asks you to create, draw, design, visualize, "
            "or generate an image, picture, illustration, or graphic."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detailed description of the image to generate. Be specific about style, composition, colors, and content.",
                },
            },
            "required": ["prompt"],
        }

    async def execute(self, **kwargs) -> dict[str, Any]:
        prompt = kwargs.get("prompt", "")
        if not prompt:
            return {"error": "No prompt provided for image generation"}

        api_key = settings.xai_api_key
        if not api_key:
            return {"error": "xAI API key not configured. Add XAI_API_KEY to .env to enable image generation."}

        payload = {
            "model": "grok-2-image",
            "prompt": prompt,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    GROK_IMAGE_URL,
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                if resp.status_code == 401:
                    return {"error": "xAI API key is invalid or expired."}
                if resp.status_code == 429:
                    return {"error": "Image generation rate limited. Try again shortly."}
                resp.raise_for_status()
                data = resp.json()
                images = data.get("data", [])
                if not images:
                    return {"error": "No image was generated"}
                image_url = images[0].get("url", "")
                if not image_url:
                    return {"error": "Image generated but no URL returned"}
                return {
                    "image_url": image_url,
                    "prompt": prompt,
                }
        except httpx.TimeoutException:
            return {"error": "Image generation timed out. Try a simpler prompt."}
        except Exception as exc:
            logger.exception("Grok Imagine failed")
            return {"error": f"Image generation failed: {str(exc)[:100]}"}
