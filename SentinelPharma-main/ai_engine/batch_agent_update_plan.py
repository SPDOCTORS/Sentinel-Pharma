"""
Batch update all SentinelPharma agents to use LLM service
"""
import re

# Agent metadata
AGENTS_MAP = {
    "iqvia_agent.py": "IQVIAInsightsAgent",
    "patent_agent.py": "PatentAgent",
    "market_agent.py": "MarketAgent",
    "exim_agent.py": "EXIMAgent",
    "vision_agent.py": "VisionAgent",
    "validation_agent.py": "ValidationAgent",
    "kol_finder_agent.py": "KOLFinderAgent",
    "pathfinder_agent.py": "MolecularPathfinderAgent",
    "web_intelligence_agent.py": "WebIntelligenceAgent",
    "internal_knowledge_agent.py": "InternalKnowledgeAgent"
}

# Import additions needed for each agent
IMPORT_ADDITIONS = """from ..services.llm_service import get_llm_service
from ..services.prompt_templates import PromptTemplates"""

# __init__ addition
INIT_ADDITION = "        self.llm_service = get_llm_service()"

# Metadata additions for results
METADATA_ADDITIONS = '''            "provider_used": llm_config.get("provider", "deterministic"),
            "llm_enhanced": False'''

print("To update all agents, add the following:")
print("\n1. After 'import structlog':")
print(IMPORT_ADDITIONS)
print("\n2. In __init__ after version:")
print(INIT_ADDITION)
print("\n3. In result dictionaries in 'analyze' methods:")
print(METADATA_ADDITIONS)
print("\n4. Update each agent's analyze method to optionally call LLM")
print("   (see clinical_agent.py for reference implementation)")
