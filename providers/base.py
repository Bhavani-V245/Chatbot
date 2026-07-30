from abc import ABC, abstractmethod

class BaseAIProvider(ABC):
    """
    Abstract Base Class for AI Model Providers.
    Ensures unified interface for processing messages regardless of underlying backend API.
    """
    @abstractmethod
    def generate_response(self, messages: list, options: dict = None) -> str:
        """
        Generate completion for given messages.
        :param messages: List of dicts with role and content (or string content)
        :param options: Optional dict containing temperature, top_p, model_name, etc.
        :return: String bot response
        """
        pass
