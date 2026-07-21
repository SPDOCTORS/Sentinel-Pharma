"""
SentinelPharma Privacy Toggle Manager
==================================
Handles switching between Cloud (Gemini) and Local (Llama 3) AI models.

This is a core component for the hybrid architecture, enabling:
- HIPAA-compliant local processing for sensitive data
- Cloud processing with Google Gemini
- Seamless switching between providers
"""

from typing import Dict, Any, Optional
import structlog

from .config import settings

logger = structlog.get_logger(__name__)


class PrivacyManager:
    """
    Manages AI model selection and configuration.
    
    Supported Providers:
    1. Google Gemini 1.5 Flash
       - FREE with generous limits (1M tokens/month)
       - Fast and capable
       - 1 million token context window
       - Requires API key and internet
    
    2. Ollama (Local) - llama3:8b, mistral:7b, gemma3:1b
       - HIPAA/GDPR compliant
       - Data never leaves premises
       - Free, unlimited usage
       - Works offline
    """
    
    def __init__(self):
        self.gemini_enabled = settings.GEMINI_ENABLED and settings.GEMINI_API_KEY is not None
        self.ollama_enabled = settings.LOCAL_ENABLED
        self.default_provider = settings.DEFAULT_LLM_PROVIDER
        
        logger.info(
            "PrivacyManager initialized",
            gemini_available=self.gemini_enabled,
            ollama_available=self.ollama_enabled,
            default_provider=self.default_provider
        )
    
    def get_llm_config(self, mode: str = "auto", provider: Optional[str] = None) -> Dict[str, Any]:
        """
        Get LLM configuration based on mode and provider.
        
        Args:
            mode: 'auto' (detect best), 'secure' (local only), 'cloud' (any cloud provider)
            provider: Specific provider - 'ollama' or 'gemini' (overrides mode)
            
        Returns:
            Dictionary containing model configuration
        """
        # If specific provider requested, use it
        if provider:
            if provider == "gemini":
                return self._get_gemini_config()
            elif provider == "ollama":
                return self._get_ollama_config()
            else:
                logger.warning(f"Unknown provider: {provider}, falling back to auto")
        
        # Auto-detect best available provider
        if mode == "auto":
            # Priority: default_provider > gemini (free) > ollama (local)
            if self.default_provider == "gemini" and self.gemini_enabled:
                return self._get_gemini_config()
            elif self.default_provider == "ollama" and self.ollama_enabled:
                return self._get_ollama_config()
            # Fallback priority: gemini (free) > ollama (local)
            elif self.gemini_enabled:
                logger.info("Auto-detected: Google Gemini (free)")
                return self._get_gemini_config()
            elif self.ollama_enabled:
                logger.info("Auto-detected: Ollama (local)")
                return self._get_ollama_config()
            else:
                logger.error("No LLM provider available!")
                raise ValueError("No LLM provider configured. Please enable Gemini or Ollama.")
        
        # Secure mode: force local
        if mode == "secure":
            return self._get_ollama_config()
        
        # Cloud mode: use Gemini
        if mode == "cloud":
            if self.gemini_enabled:
                return self._get_gemini_config()
            else:
                logger.warning("Cloud mode requested but Gemini not available, falling back to Ollama")
                return self._get_ollama_config()
        
        # Default fallback
        return self._get_ollama_config()
    
    def _get_gemini_config(self) -> Dict[str, Any]:
        """Get Google Gemini configuration"""
        if not self.gemini_enabled:
            logger.warning("Gemini requested but not available, falling back to Ollama")
            return self._get_ollama_config()
        
        return {
            "provider": "gemini",
            "model": settings.GEMINI_MODEL,
            "api_key": settings.GEMINI_API_KEY,
            "temperature": 0.7,
            "max_tokens": 8192,
            "privacy_level": "cloud",
            "data_residency": "cloud",
            "capabilities": {
                "complex_reasoning": True,
                "multi_modal": True,
                "context_window": 1000000  # 1M tokens!
            }
        }
    
    def _get_ollama_config(self) -> Dict[str, Any]:
        """Get Ollama (local) configuration"""
        if not self.ollama_enabled:
            logger.error("Ollama requested but not available")
            raise ValueError("Ollama not configured or unavailable")
        
        return {
            "provider": "ollama",
            "model": settings.OLLAMA_MODEL,
            "base_url": settings.OLLAMA_BASE_URL,
            "temperature": 0.7,
            "max_tokens": 2048,
            "privacy_level": "hipaa_compliant",
            "data_residency": "on_premise",
            "capabilities": {
                "complex_reasoning": True,
                "multi_modal": False,
                "context_window": 8192
            }
        }
    
    def validate_mode(self, mode: str) -> bool:
        """
        Validate if the requested mode is available.
        
        Args:
            mode: Processing mode to validate
            
        Returns:
            True if mode is available
        """
        if mode == "secure":
            return self.ollama_enabled
        elif mode == "cloud":
            return self.gemini_enabled
        elif mode == "auto":
            return True  # Auto always works if at least one provider available
        return False
    
    def get_available_providers(self) -> Dict[str, bool]:
        """Get all available LLM providers"""
        return {
            "gemini": self.gemini_enabled,
            "ollama": self.ollama_enabled
        }
    
    def get_available_modes(self) -> Dict[str, bool]:
        """Get all available processing modes"""
        return {
            "auto": True,
            "secure": self.ollama_enabled,
            "cloud": self.gemini_enabled
        }

