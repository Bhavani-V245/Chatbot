from .github_provider import GitHubProvider
from .gemini_provider import GeminiProvider
from .claude_provider import ClaudeProvider
from .groq_provider import GroqProvider

class ProviderFactory:
    """
    Factory for instantiating model providers cleanly.
    """
    _providers = {
        "github": GitHubProvider,
        "azure": GitHubProvider,
        "gemini": GeminiProvider,
        "google": GeminiProvider,
        "claude": ClaudeProvider,
        "anthropic": ClaudeProvider,
        "groq": GroqProvider
    }

    @classmethod
    def get_provider(cls, provider_name: str = "github"):
        key = (provider_name or "github").lower().strip()
        provider_cls = cls._providers.get(key, GitHubProvider)
        return provider_cls()
