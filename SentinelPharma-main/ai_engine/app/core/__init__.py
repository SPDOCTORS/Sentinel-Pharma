"""
AI Engine Core Package
======================
Core configuration and security modules.
"""

from .config import settings
from .privacy_toggle import PrivacyManager

__all__ = ["settings", "PrivacyManager"]
