import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv
from .base import BaseAIProvider
from .github_provider import GitHubProvider

load_dotenv(override=False)

class GroqProvider(BaseAIProvider):
    """
    Provider for Groq API models (Llama 3, Mixtral, etc) using standard OpenAI-compatible REST endpoints.
    """
    MODEL_MAP = {
        "llama-3.1-8b-instant": "llama-3.1-8b-instant",
        "llama-3.1-70b-versatile": "llama-3.1-70b-versatile",
        "mixtral-8x7b-32768": "mixtral-8x7b-32768",
        "gemma2-9b-it": "gemma2-9b-it"
    }

    def generate_response(self, messages: list, options: dict = None) -> str:
        options = options or {}
        model_key = options.get("model_name", "llama-3.1-8b-instant")
        target_model = self.MODEL_MAP.get(model_key, "llama-3.1-8b-instant")

        load_dotenv(override=True)
        api_key = os.environ.get("GROQ_API_KEY", "").strip()

        if not api_key:
            raise Exception("GROQ_API_KEY is missing from .env file")

        url = "https://api.groq.com/openai/v1/chat/completions"

        # Format messages for OpenAI standard
        formatted_messages = []
        for msg in messages:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = msg.get("content", "")
            
            # Extract text if content is a list of dicts
            if isinstance(content, list):
                text_parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                content = "\n".join(text_parts)
                
            if content:
                formatted_messages.append({"role": role, "content": str(content)})

        if not formatted_messages:
            formatted_messages.append({"role": "user", "content": "Hello"})

        payload = {
            "model": target_model,
            "messages": formatted_messages,
            "temperature": float(options.get("temperature", 0.7)),
            "top_p": float(options.get("top_p", 0.95)),
            "max_tokens": 2048
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices and choices[0].get("message", {}).get("content"):
                    return choices[0]["message"]["content"]
            
            raise Exception("Unknown Groq response format")
        except urllib.error.HTTPError as e:
            reason = "Unknown Error"
            if e.code == 429:
                reason = "Quota Exceeded / Rate Limit"
            elif e.code in [401, 403]:
                reason = "Invalid API Key"
            elif e.code == 404:
                reason = f"Model {target_model} not found"
                
            raise Exception(f"Groq API Error ({e.code} - {reason})")
        except Exception as e:
            raise Exception(f"Connection error: {str(e)}")

