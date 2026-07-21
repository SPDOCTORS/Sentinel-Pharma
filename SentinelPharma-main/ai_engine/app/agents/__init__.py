"""
SentinelPharma AI Agents Package
=============================
Multi-agent system for drug repurposing analysis.

Core Agents (10):
- ClinicalAgent: Clinical trial analysis with Gemini
- PatentAgent: Patent landscape and FTO analysis with Gemini
- IQVIAInsightsAgent: Market intelligence with mock data + Gemini
- EXIMAgent: Export-Import trade intelligence
- VisionAgent: Molecular structure analysis with Gemini Vision
- WebIntelligenceAgent: Real-time web signals with Gemini
- InternalKnowledgeAgent: Proprietary document RAG with Local Llama 3
- RegulatoryAgent: FDA/EMA risk assessment with Gemini
- PatientSentimentAgent: NLP sentiment and unmet needs analysis
- ValidationAgent: Risk assessment and validation (The Skeptic)

Orchestrator:
- MasterOrchestrator: Coordinates all agents
"""

from .clinical_agent import ClinicalAgent
from .patent_agent import PatentAgent
from .iqvia_agent import IQVIAInsightsAgent
from .exim_agent import EXIMAgent
from .vision_agent import VisionAgent
from .validation_agent import ValidationAgent
from .web_intelligence_agent import WebIntelligenceAgent
from .internal_knowledge_agent import InternalKnowledgeAgent
from .regulatory_agent import RegulatoryAgent
from .patient_sentiment_agent import PatientSentimentAgent
from .orchestrator import MasterOrchestrator

__all__ = [
    "ClinicalAgent",
    "PatentAgent",
    "IQVIAInsightsAgent",
    "EXIMAgent",
    "VisionAgent",
    "ValidationAgent",
    "WebIntelligenceAgent",
    "InternalKnowledgeAgent",
    "RegulatoryAgent",
    "PatientSentimentAgent",
    "MasterOrchestrator"
]
