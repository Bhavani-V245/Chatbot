import os
from dotenv import load_dotenv
from .base import BaseAIProvider
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import (
    SystemMessage, UserMessage, AssistantMessage,
    ImageContentItem, TextContentItem, ImageUrl
)
from azure.core.credentials import AzureKeyCredential

load_dotenv(override=False)

class GitHubProvider(BaseAIProvider):
    """
    Robust Provider for GitHub Models / Azure AI Inference API.
    Supports gpt-4o-mini, DeepSeek-R1, gpt-4o.
    Automatically maps deprecated/invalid model names to gpt-4o-mini.
    """

    MODEL_MAP = {
        "gpt-4o-mini": "gpt-4o-mini",
        "gpt-4o": "gpt-4o",
        "DeepSeek-R1": "DeepSeek-R1",
        "phi-3-medium-instruct": "gpt-4o-mini",
        "Phi-3-medium-instruct": "gpt-4o-mini",
        "Phi-3-mini-4k-instruct": "gpt-4o-mini"
    }

    def __init__(self, endpoint: str = None):
        self.endpoint = endpoint or "https://models.inference.ai.azure.com"

    def _build_user_message(self, content):
        if isinstance(content, str):
            return UserMessage(content)
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(TextContentItem(text=item["text"]))
                elif item.get("type") == "image_url":
                    url = item.get("image_url", {}).get("url", "")
                    parts.append(ImageContentItem(image_url=ImageUrl(url=url)))
        return UserMessage(content=parts if parts else str(content))

    def generate_response(self, messages: list, options: dict = None) -> str:
        options = options or {}
        model_name = options.get("model_name", "gpt-4o-mini")
        target_model = self.MODEL_MAP.get(model_name, model_name)
        
        temperature = float(options.get("temperature", 0.8))
        top_p = float(options.get("top_p", 0.1))

        load_dotenv(override=True)
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if not token:
            raise Exception("GITHUB_TOKEN is missing or invalid. Please check your .env file.")

        client = ChatCompletionsClient(
            endpoint=self.endpoint,
            credential=AzureKeyCredential(token),
            retry_total=0
        )

        formatted_messages = [SystemMessage(
            "You are a helpful assistant. When the user shares an image, describe and analyse it. "
            "When they share file contents, read and assist with them."
        )]

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")
            if role == "user":
                formatted_messages.append(self._build_user_message(content))
            elif role == "assistant":
                formatted_messages.append(AssistantMessage(content if isinstance(content, str) else str(content)))

        try:
            response = client.complete(
                messages=formatted_messages,
                temperature=temperature,
                top_p=top_p,
                max_tokens=2048,
                model=target_model
            )
            return response.choices[0].message.content
        except Exception as e:
            err_str = str(e).lower()
            if "unauthorized" in err_str or "401" in err_str:
                raise Exception("Authentication Error: The API token is invalid or expired.")
            elif "rate_limit" in err_str or "429" in err_str:
                raise Exception("Rate Limit Exceeded: You have reached the API limit.")
            else:
                raise Exception(f"GitHub Models API Error: {str(e)}")
