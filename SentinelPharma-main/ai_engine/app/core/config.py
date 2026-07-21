"""
SentinelPharma AI Engine Configuration
===================================
Application settings and configuration management.
"""

import os
from typing import Optional
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


AI_ENGINE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = str(AI_ENGINE_ROOT / ".env")


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """
    
    # Application
    APP_NAME: str = "SentinelPharma AI Engine"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Cloud AI - Google Gemini
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash-exp"
    GEMINI_ENABLED: bool = True
    
    # Legacy setting
    CLOUD_ENABLED: bool = True
    
    # Local AI (Llama 3 via Ollama)
    LOCAL_MODEL_PATH: Optional[str] = None
    LOCAL_MODEL_NAME: str = "llama3:8b"
    LOCAL_ENABLED: bool = True
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3:8b"
    
    # Default LLM Provider
    DEFAULT_LLM_PROVIDER: str = "gemini"  # gemini or ollama
    
    # Node.js Backend
    NODE_BACKEND_URL: str = "http://localhost:3001"
    
    # Neo4j (Knowledge Graph)
    NEO4J_URI: Optional[str] = "bolt://localhost:7687"
    NEO4J_USER: Optional[str] = "neo4j"
    NEO4J_PASSWORD: Optional[str] = None
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=os.getenv("SENTINELPHARMA_ENV_FILE", DEFAULT_ENV_FILE),
        case_sensitive=True
    )

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False

        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
            return True
        if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
            return False
        return False


# Global settings instance
settings = Settings()
