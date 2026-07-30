import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv
from .base import BaseAIProvider
from .github_provider import GitHubProvider

load_dotenv(override=False)

class GeminiProvider(BaseAIProvider):
    """
    Robust Provider for Google Gemini Models (gemini-1.5-flash, gemini-1.5-pro, etc.).
    Handles rate limits, invalid keys, missing parameters, and safety blocks gracefully 
    by returning seamless fallback AI responses without breaking user experience.
    """

    MODEL_MAP = {
        "gemini-2.5-flash": "gemini-1.5-flash",
        "gemini-2.5-pro": "gemini-1.5-pro",
        "gemini-1.5-flash": "gemini-1.5-flash",
        "gemini-1.5-pro": "gemini-1.5-pro",
        "gemini-2.0-flash": "gemini-2.0-flash-exp"
    }

    def generate_response(self, messages: list, options: dict = None) -> str:
        options = options or {}
        model_key = options.get("model_name", "gemini-1.5-flash")
        target_model = self.MODEL_MAP.get(model_key, "gemini-1.5-flash")

        # Reload env vars to pick up any runtime .env changes
        load_dotenv(override=True)
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()

        if not api_key:
            return self._execute_fallback(messages, options)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"

        try:
            contents = []
            for msg in messages:
                role = "user" if msg.get("role") == "user" else "model"
                raw_content = msg.get("content", "")
                
                parts = []
                if isinstance(raw_content, str):
                    parts.append({"text": raw_content})
                elif isinstance(raw_content, list):
                    for p in raw_content:
                        if isinstance(p, dict):
                            if p.get("type") == "text":
                                parts.append({"text": p.get("text", "")})
                            elif p.get("type") == "image_url":
                                img_url = p.get("image_url", {}).get("url", "")
                                if img_url.startswith("data:"):
                                    header, data = img_url.split(",", 1)
                                    mime_type = header.split(";")[0].replace("data:", "")
                                    parts.append({"inlineData": {"mimeType": mime_type, "data": data}})

                if parts:
                    contents.append({"role": role, "parts": parts})

            if not contents:
                contents.append({"role": "user", "parts": [{"text": "Hello"}]})

            payload = {
                "contents": contents,
                "generationConfig": {
                    "temperature": float(options.get("temperature", 0.7)),
                    "topP": float(options.get("top_p", 0.95)),
                    "maxOutputTokens": 2048
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )

            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and parts[0].get("text"):
                        return parts[0].get("text", "")
            
            return self._execute_fallback(messages, options)
        except Exception:
            return self._execute_fallback(messages, options)

    def _execute_fallback(self, messages: list, options: dict) -> str:
        fallback_options = dict(options or {})
        fallback_options["model_name"] = "gpt-4o-mini"
        github_fallback = GitHubProvider()
        return github_fallback.generate_response(messages, fallback_options)
