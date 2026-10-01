"""
SentinelPharma Master Orchestrator Agent
=====================================
Coordinates all worker agents and manages the analysis pipeline.

Responsibilities:
- Decomposes complex user queries into sub-tasks
- Routes tasks to appropriate worker agents
- Aggregates JSON outputs into cohesive summary
- Manages parallel and sequential agent execution
"""

import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
import structlog

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

logger = structlog.get_logger(__name__)


class MasterOrchestrator:
    """
    Master Orchestrator Agent - The brain of the multi-agent system.
    
    This agent:
    1. Parses and understands user queries
    2. Determines which agents to engage
    3. Manages agent execution (parallel/sequential)
    4. Aggregates and validates results
    5. Generates final comprehensive report
    """
    
    def __init__(self):
        self.name = "MasterOrchestrator"
        self.version = "1.0.0"
        
        # Initialize all worker agents
        self.agents = {
            "clinical": ClinicalAgent(),
            "patent": PatentAgent(),
            "iqvia": IQVIAInsightsAgent(),
            "exim": EXIMAgent(),
            "vision": VisionAgent(),
            "validation": ValidationAgent(),
            "web_intelligence": WebIntelligenceAgent(),
            "internal_knowledge": InternalKnowledgeAgent(),
            "regulatory": RegulatoryAgent(),
            "patient_sentiment": PatientSentimentAgent()
        }
        
        logger.info(f"Initialized {self.name} v{self.version}", 
                    agents_available=list(self.agents.keys()))
    
    async def process_query(
        self, 
        query: str, 
        molecule: str,
        llm_config: Dict[str, Any],
        requested_agents: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Process a user query through the multi-agent pipeline.
        
        Args:
            query: Natural language query from user
            molecule: Drug/compound name to analyze
            llm_config: LLM configuration (cloud/local)
            requested_agents: Specific agents to engage (optional)
            
        Returns:
            Comprehensive analysis results from all agents
        """
        start_time = datetime.now()
        request_id = f"orch_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        logger.info(
            "orchestration_started",
            request_id=request_id,
            query=query[:100],
            molecule=molecule
        )
        
        # Step 1: Decompose query into sub-tasks
        sub_tasks = self._decompose_query(query, molecule)
        
        # Step 2: Determine agents to engage
        agents_to_run = requested_agents or self._determine_agents(sub_tasks)
        
        logger.info(
            "agents_selected",
            request_id=request_id,
            agents=agents_to_run
        )
        
        # Step 3: Execute agents in parallel
        results = await self._execute_agents(
            molecule=molecule,
            agents=agents_to_run,
            llm_config=llm_config,
            request_id=request_id
        )
        
        # Step 4: Run validation agent on results
        if "validation" in agents_to_run or True:  # Always validate
            validation_result = await self.agents["validation"].analyze(
                molecule=molecule,
                agent_results=results,
                llm_config=llm_config
            )
            results["validation"] = validation_result
        
        # Step 5: Aggregate and generate summary
        summary = self._generate_summary(results, molecule)
        
        # Calculate total processing time
        total_time_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        final_result = {
            "request_id": request_id,
            "query": query,
            "molecule": molecule,
            "processing_mode": llm_config.get("provider"),
            "model_used": llm_config.get("model"),
            "sub_tasks": sub_tasks,
            "agents_executed": [
                {
                    "name": agent_name,
                    "status": "completed" if agent_name in results else "skipped",
                    "duration_ms": results.get(agent_name, {}).get("processing_time_ms", 0)
                }
                for agent_name in agents_to_run
            ],
            "results": results,
            "summary": summary,
            "total_processing_time_ms": round(total_time_ms, 2),
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(
            "orchestration_completed",
            request_id=request_id,
            agents_count=len(results),
            total_time_ms=round(total_time_ms, 2)
        )
        
        return final_result
    
    def _decompose_query(self, query: str, molecule: str) -> List[Dict[str, Any]]:
        """
        Decompose a complex query into sub-tasks.
        
        Args:
            query: User's natural language query
            molecule: Target molecule/drug
            
        Returns:
            List of sub-tasks with priorities
        """
        query_lower = query.lower()
        sub_tasks = []
        
        # Clinical analysis task
        if any(kw in query_lower for kw in ['clinical', 'trial', 'safety', 'efficacy', 'indication']):
            sub_tasks.append({
                "type": "clinical_analysis",
                "agent": "clinical",
                "priority": 1,
                "description": f"Analyze clinical trial data for {molecule}"
            })
        
        # Patent analysis task
        if any(kw in query_lower for kw in ['patent', 'ip', 'fto', 'intellectual property', 'expir']):
            sub_tasks.append({
                "type": "patent_analysis",
                "agent": "patent",
                "priority": 2,
                "description": f"Analyze patent landscape for {molecule}"
            })
        
        # Market analysis via IQVIA
        if any(kw in query_lower for kw in ['market', 'roi', 'revenue', 'investment', 'commercial']):
            sub_tasks.append({
                "type": "iqvia_analysis",
                "agent": "iqvia",
                "priority": 1,
                "description": f"IQVIA market intelligence for {molecule}"
            })
        
        # Vision/structural analysis task
        if any(kw in query_lower for kw in ['structure', 'molecular', 'binding', 'visual', '3d']):
            sub_tasks.append({
                "type": "structural_analysis",
                "agent": "vision",
                "priority": 3,
                "description": f"Analyze molecular structure of {molecule}"
            })
        
        # Regulatory task
        if any(kw in query_lower for kw in ['regulatory', 'fda', 'ema', 'approval', 'compliance', 'risk']):
            sub_tasks.append({
                "type": "regulatory_analysis",
                "agent": "regulatory",
                "priority": 1,
                "description": f"FDA/EMA regulatory risk assessment for {molecule}"
            })
        
        # Patient Sentiment task
        if any(kw in query_lower for kw in ['patient', 'sentiment', 'feedback', 'unmet', 'needs', 'satisfaction']):
            sub_tasks.append({
                "type": "patient_sentiment",
                "agent": "patient_sentiment",
                "priority": 2,
                "description": f"Patient sentiment and unmet needs analysis for {molecule}"
            })
        
        # IQVIA/Market Intelligence task
        if any(kw in query_lower for kw in ['iqvia', 'sales', 'cagr', 'competitor', 'volume shift', 'commercial']):
            sub_tasks.append({
                "type": "iqvia_analysis",
                "agent": "iqvia",
                "priority": 1,
                "description": f"IQVIA market intelligence for {molecule}"
            })
        
        # EXIM Trade Intelligence task
        if any(kw in query_lower for kw in ['exim', 'trade', 'import', 'export', 'supply chain', 'sourcing', 'api']):
            sub_tasks.append({
                "type": "exim_analysis",
                "agent": "exim",
                "priority": 2,
                "description": f"Export-Import trade analysis for {molecule}"
            })
        
        # Web Intelligence task
        if any(kw in query_lower for kw in ['news', 'web', 'pubmed', 'publication', 'articles']):
            sub_tasks.append({
                "type": "web_intelligence",
                "agent": "web_intelligence",
                "priority": 3,
                "description": f"Real-time web intelligence for {molecule}"
            })
        
        # Internal Knowledge task
        if any(kw in query_lower for kw in ['internal', 'document', 'history', 'previous', 'prior', 'strategy']):
            sub_tasks.append({
                "type": "internal_knowledge",
                "agent": "internal_knowledge",
                "priority": 4,
                "description": f"Internal knowledge search for {molecule}"
            })
        
        # If no specific keywords, run comprehensive analysis
        if not sub_tasks:
            sub_tasks = [
                {"type": "clinical_analysis", "agent": "clinical", "priority": 1, "description": f"Clinical analysis for {molecule}"},
                {"type": "patent_analysis", "agent": "patent", "priority": 2, "description": f"Patent analysis for {molecule}"},
                {"type": "iqvia_analysis", "agent": "iqvia", "priority": 1, "description": f"IQVIA market intelligence for {molecule}"},
                {"type": "exim_analysis", "agent": "exim", "priority": 2, "description": f"EXIM trade analysis for {molecule}"},
                {"type": "structural_analysis", "agent": "vision", "priority": 3, "description": f"Structural analysis for {molecule}"},
                {"type": "web_intelligence", "agent": "web_intelligence", "priority": 3, "description": f"Web intelligence for {molecule}"},
                {"type": "internal_knowledge", "agent": "internal_knowledge", "priority": 4, "description": f"Internal knowledge for {molecule}"},
                {"type": "regulatory_analysis", "agent": "regulatory", "priority": 1, "description": f"Regulatory assessment for {molecule}"},
                {"type": "patient_sentiment", "agent": "patient_sentiment", "priority": 2, "description": f"Patient sentiment for {molecule}"},
            ]
        
        # Sort by priority
        return sorted(sub_tasks, key=lambda x: x["priority"])
    
    def _determine_agents(self, sub_tasks: List[Dict[str, Any]]) -> List[str]:
        """Determine which agents to run based on sub-tasks."""
        return list(set(task["agent"] for task in sub_tasks))
    
    async def _execute_agents(
        self,
        molecule: str,
        agents: List[str],
        llm_config: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """
        Execute multiple agents in TRUE parallel using asyncio.gather().
        
        Args:
            molecule: Target molecule
            agents: List of agent names to execute
            llm_config: LLM configuration
            request_id: Request identifier
            
        Returns:
            Dictionary of agent results
        """
        results = {}
        
        # Prepare tasks with agent names
        async def run_agent(agent_name: str):
            """Run a single agent and return (name, result) tuple."""
            try:
                if agent_name not in self.agents or agent_name == "validation":
                    return (agent_name, {"error": "Agent not found", "status": "skipped"})
                
                agent = self.agents[agent_name]
                
                # All agents use analyze() method
                result = await agent.analyze(molecule, llm_config)
                
                logger.info(f"agent_completed", agent=agent_name, request_id=request_id)
                return (agent_name, result)
                
            except Exception as e:
                logger.error(f"agent_failed", agent=agent_name, error=str(e))
                return (agent_name, {"error": str(e), "status": "failed"})
        
        # Create tasks for all agents
        tasks = [run_agent(agent_name) for agent_name in agents]
        
        # Execute ALL tasks concurrently with asyncio.gather()
        agent_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for item in agent_results:
            if isinstance(item, tuple):
                agent_name, result = item
                results[agent_name] = result
            elif isinstance(item, Exception):
                logger.error(f"agent_exception", error=str(item))
        
        return results
    
    def _generate_summary(self, results: Dict[str, Any], molecule: str) -> Dict[str, Any]:
        """
        Generate an executive summary from all agent results.
        
        Args:
            results: Combined results from all agents
            molecule: Target molecule
            
        Returns:
            Executive summary with key insights
        """
        summary = {
            "molecule": molecule,
            "overall_assessment": "FAVORABLE",
            "key_findings": [],
            "risks": [],
            "opportunities": [],
            "recommended_actions": []
        }
        
        # Extract clinical findings
        if "clinical" in results and "error" not in results["clinical"]:
            clinical = results["clinical"]
            summary["key_findings"].append(
                f"Found {clinical.get('total_trials_found', 0)} clinical trials with safety score {clinical.get('safety_score', 'N/A')}/10"
            )
            if clinical.get("potential_new_indications"):
                summary["opportunities"].extend([
                    f"Potential new indication: {ind}" 
                    for ind in clinical["potential_new_indications"][:2]
                ])
        
        # Extract patent findings
        if "patent" in results and "error" not in results["patent"]:
            patent = results["patent"]
            summary["key_findings"].append(
                f"Patent expiration: {patent.get('earliest_expiration', 'Unknown')} | FTO Status: {patent.get('freedom_to_operate', 'Unknown')}"
            )
            if patent.get("blocking_patents", 0) > 0:
                summary["risks"].append(
                    f"{patent['blocking_patents']} blocking patents identified"
                )
        
        # Extract IQVIA market findings
        if "iqvia" in results and "error" not in results["iqvia"]:
            iqvia = results["iqvia"]
            summary["key_findings"].append(
                f"Market Size: ${iqvia.get('global_market_size_usd_bn', 0)}B | CAGR: {iqvia.get('cagr_percent', 0)}%"
            )
        
        # Extract regulatory findings
        if "regulatory" in results and "error" not in results["regulatory"]:
            regulatory = results["regulatory"]
            summary["key_findings"].append(
                f"Regulatory Risk: {regulatory.get('risk_level', 'Unknown')} | FDA Approval: {regulatory.get('fda_approval_probability', 0)*100}%"
            )
            if regulatory.get("risk_score", 0) > 7.0:
                summary["risks"].append(f"High regulatory risk score: {regulatory['risk_score']}/10")
        
        # Extract patient sentiment findings
        if "patient_sentiment" in results and "error" not in results["patient_sentiment"]:
            sentiment = results["patient_sentiment"]
            summary["key_findings"].append(
                f"Patient Satisfaction: {sentiment.get('treatment_satisfaction_score', 0)}% | Sentiment: {sentiment.get('sentiment_classification', 'Unknown')}"
            )
            if sentiment.get("unmet_needs_identified"):
                summary["opportunities"].extend([
                    f"Unmet need: {need['need']}"
                    for need in sentiment["unmet_needs_identified"][:2]
                ])
        
        # Extract validation concerns
        if "validation" in results and "error" not in results["validation"]:
            validation = results["validation"]
            summary["risks"].extend(validation.get("risk_flags", [])[:3])
            
            # Adjust overall assessment based on validation
            if validation.get("overall_confidence", "HIGH") == "LOW":
                summary["overall_assessment"] = "CAUTIOUS"
            elif validation.get("critical_issues", []):
                summary["overall_assessment"] = "REVIEW_REQUIRED"
        
        return summary
    
    def get_agent_status(self) -> Dict[str, Any]:
        """Get status of all available agents."""
        return {
            "orchestrator": {
                "name": self.name,
                "version": self.version,
                "status": "active"
            },
            "agents": [
                {
                    "name": agent.name,
                    "version": agent.version,
                    "status": "active"
                }
                for agent in self.agents.values()
            ]
        }
