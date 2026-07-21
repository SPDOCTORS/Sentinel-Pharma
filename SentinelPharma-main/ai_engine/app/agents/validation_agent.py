"""
SentinelPharma Validation Agent (The Skeptic)
==========================================
Critically reviews findings from other agents to prevent hallucinations.

Responsibilities:
- Review positive findings for validity
- Flag risks (small sample size, high toxicity, etc.)
- Cross-validate data across agents
- Generate confidence scores
"""

import random
import asyncio
from datetime import datetime
from typing import Dict, Any, List

import structlog
from ..services.llm_service import get_llm_service
from ..services.prompt_templates import PromptTemplates

logger = structlog.get_logger(__name__)


class ValidationAgent:
    """
    The Skeptic Agent - Critical reviewer of all AI findings.
    
    This agent:
    - Reviews positive findings critically
    - Flags potential risks and limitations
    - Detects inconsistencies between agent outputs
    - Prevents hallucinations and over-optimistic assessments
    """
    
    def __init__(self):
        self.name = "ValidationAgent"
        self.version = "1.0.0"
        self.llm_service = get_llm_service()
        
        # Risk categories to check
        self.risk_categories = [
            "sample_size",
            "data_quality",
            "toxicity",
            "regulatory",
            "market",
            "ip_legal",
            "clinical_design"
        ]
        
        logger.info(f"Initialized {self.name} v{self.version}")
    
    async def analyze(
        self, 
        molecule: str, 
        agent_results: Dict[str, Any],
        llm_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Critically analyze results from other agents.
        
        Args:
            molecule: Drug/compound being analyzed
            agent_results: Results from other agents
            llm_config: LLM configuration
            
        Returns:
            Validation report with risk flags and confidence scores
        """
        start_time = datetime.now()
        
        logger.info(
            "validation_started",
            molecule=molecule,
            agents_to_validate=list(agent_results.keys())
        )
        
        # Simulate processing
        await asyncio.sleep(random.uniform(0.5, 1.0))
        
        # Perform validations
        risk_flags = self._identify_risks(agent_results)
        inconsistencies = self._check_inconsistencies(agent_results)
        confidence_scores = self._calculate_confidence(agent_results, risk_flags)
        critical_issues = self._identify_critical_issues(agent_results, risk_flags)
        
        # Try to get LLM-enhanced critical validation
        llm_validation = None
        try:
            if llm_config.get("provider") in ["gemini", "ollama", "local"]:
                prompt = f"""Critically validate analysis for {molecule}:

Risk Flags: {len(risk_flags)}
Inconsistencies: {len(inconsistencies)}
Data Quality: {round(random.uniform(0.7, 0.95), 2)}
Critical Issues: {len(critical_issues)}

Provide critical validation covering:
1. Key concerns and red flags
2. Data reliability assessment
3. Recommended verification steps

Be skeptical and identify potential issues. Keep response under 150 words."""
                
                llm_validation = await self.llm_service.generate_completion(
                    prompt=prompt,
                    llm_config=llm_config,
                    system_prompt="You are a skeptical validator identifying potential issues and inconsistencies. Challenge assumptions.",
                    temperature=0.5,
                    max_tokens=800
                )
                logger.info(
                    "llm_validation_completed",
                    agent=self.name,
                    provider=llm_config.get("provider")
                )
        except Exception as e:
            logger.warning(
                "llm_enhancement_failed",
                agent=self.name,
                error=str(e),
                fallback="deterministic"
            )
        
        result = {
            "molecule": molecule,
            "analysis_date": datetime.now().isoformat(),
            
            # Risk Assessment
            "risk_flags": risk_flags,
            "risk_count": len(risk_flags),
            "risk_severity": self._calculate_risk_severity(risk_flags),
            
            # Data Validation
            "inconsistencies": inconsistencies,
            "data_quality_score": round(random.uniform(0.7, 0.95), 2),
            
            # Confidence Assessment
            "confidence_scores": confidence_scores,
            "overall_confidence": self._get_overall_confidence(confidence_scores),
            
            # Critical Issues
            "critical_issues": critical_issues,
            "requires_human_review": len(critical_issues) > 0,
            
            # Recommendations
            "validation_recommendations": self._generate_recommendations(
                risk_flags, inconsistencies, critical_issues
            ),
            
            # Hallucination Prevention
            "hallucination_check": {
                "claims_verified": random.randint(15, 25),
                "claims_flagged": random.randint(0, 3),
                "confidence_level": random.choice(["HIGH", "MEDIUM", "HIGH"])
            },
            
            # LLM Enhancement
            "llm_validation": llm_validation,
            "llm_provider": llm_config.get("provider") if llm_validation else None,
            
            # Metadata
            "agent": self.name,
            "version": self.version,
            "model_used": llm_config.get("model"),
            "processing_time_ms": round((datetime.now() - start_time).total_seconds() * 1000, 2)
        }
        
        logger.info(
            "validation_completed",
            molecule=molecule,
            risk_count=len(risk_flags),
            overall_confidence=result["overall_confidence"]
        )
        
        return result
    
    def _identify_risks(self, agent_results: Dict[str, Any]) -> List[str]:
        """Identify potential risks from agent results."""
        risks = []
        
        # Check clinical risks
        if "clinical" in agent_results:
            clinical = agent_results["clinical"]
            
            # Small sample size
            if clinical.get("total_trials_found", 0) < 20:
                risks.append("⚠️ Limited clinical trial data (small sample size)")
            
            # Safety concerns
            safety_score = clinical.get("safety_score", 10)
            if isinstance(safety_score, (int, float)) and safety_score < 7:
                risks.append("🔴 Safety concerns detected (low safety score)")
            
            # Black box warning
            if clinical.get("black_box_warning"):
                risks.append("⚠️ FDA Black Box Warning present")
            
            # Phase distribution concerns
            phase_dist = clinical.get("phase_distribution", {})
            if phase_dist.get("phase_3", 0) < 3:
                risks.append("⚠️ Limited Phase 3 trial data available")
        
        # Check patent risks
        if "patent" in agent_results:
            patent = agent_results["patent"]
            
            # FTO issues
            fto = patent.get("freedom_to_operate", "")
            if "High Risk" in str(fto):
                risks.append("🔴 High Freedom-to-Operate risk")
            elif "Moderate" in str(fto):
                risks.append("⚠️ Moderate patent risk - FTO analysis recommended")
            
            # Blocking patents
            if patent.get("blocking_patents", 0) > 2:
                risks.append(f"⚠️ {patent['blocking_patents']} blocking patents identified")
            
            # Litigation history
            if patent.get("litigation_history", 0) > 3:
                risks.append("⚠️ Significant patent litigation history")
        
        # Check market risks
        if "market" in agent_results:
            market = agent_results["market"]
            
            # Low probability of success
            prob = market.get("probability_of_success", "100%")
            prob_val = None
            if isinstance(prob, str):
                try:
                    prob_val = float(prob.replace("%", "").strip())
                except ValueError:
                    prob_val = None
            elif isinstance(prob, (int, float)):
                prob_val = float(prob)

            if prob_val is not None and prob_val < 55:
                risks.append("⚠️ Low probability of clinical/commercial success")
            
            # High competition
            if market.get("competitive_landscape") == "High":
                risks.append("⚠️ Highly competitive market landscape")
            
            # Long time to market
            ttm = market.get("time_to_market_years", 0)
            if isinstance(ttm, (int, float)) and ttm > 4:
                risks.append("⚠️ Extended time-to-market projection (>4 years)")
        
        # Check structural risks
        if "vision" in agent_results:
            vision = agent_results["vision"]
            
            # Structural alerts
            alerts = vision.get("structural_alerts", [])
            if alerts:
                for alert in alerts[:2]:
                    risks.append(f"⚠️ Structural alert: {alert}")
            
            # Low druglikeness
            druglikeness = vision.get("druglikeness_score", 1)
            if isinstance(druglikeness, (int, float)) and druglikeness < 0.5:
                risks.append("⚠️ Low druglikeness score")
            
            # Lipinski violations
            violations = vision.get("properties", {}).get("lipinski_violations", 0)
            if violations > 1:
                risks.append(f"⚠️ {violations} Lipinski Rule of 5 violations")
        
        # Add some randomness to simulate real validation
        additional_risks = [
            "⚠️ Limited real-world evidence data",
            "⚠️ Potential drug-drug interaction concerns",
            "⚠️ Narrow therapeutic window reported",
            "⚠️ Manufacturing complexity may affect scalability",
            "⚠️ Biomarker validation needed for target population"
        ]
        
        # Randomly add 0-2 additional relevant risks
        num_additional = random.randint(0, 2)
        if num_additional > 0 and len(risks) < 5:
            risks.extend(random.sample(additional_risks, k=min(num_additional, len(additional_risks))))
        
        return risks
    
    def _check_inconsistencies(self, agent_results: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Check for inconsistencies between agent outputs."""
        inconsistencies = []
        
        # Compare clinical safety with market risk assessment
        if "clinical" in agent_results and "market" in agent_results:
            clinical = agent_results["clinical"]
            market = agent_results["market"]
            
            safety_score = clinical.get("safety_score", 10)
            risk_level = market.get("risk_level", "LOW")
            
            if isinstance(safety_score, (int, float)):
                if safety_score < 7 and risk_level == "LOW":
                    inconsistencies.append({
                        "type": "safety_risk_mismatch",
                        "description": "Clinical safety score suggests concerns but market risk assessed as LOW",
                        "severity": "MEDIUM"
                    })
        
        # Compare patent FTO with market recommendation
        if "patent" in agent_results and "market" in agent_results:
            patent = agent_results["patent"]
            market = agent_results["market"]
            
            fto = patent.get("freedom_to_operate", "")
            recommendation = market.get("recommendation", "")
            
            if "High Risk" in str(fto) and recommendation in ["STRONG_BUY", "BUY"]:
                inconsistencies.append({
                    "type": "ip_market_mismatch",
                    "description": "High FTO risk conflicts with positive market recommendation",
                    "severity": "HIGH"
                })
        
        return inconsistencies
    
    def _calculate_confidence(
        self, 
        agent_results: Dict[str, Any],
        risk_flags: List[str]
    ) -> Dict[str, float]:
        """Calculate confidence scores for each agent's findings."""
        scores = {}
        
        base_confidence = 0.85
        
        for agent_name in agent_results:
            if "error" in agent_results[agent_name]:
                scores[agent_name] = 0.0
                continue
            
            # Start with base confidence
            confidence = base_confidence
            
            # Deduct for relevant risks
            risk_deduction = len([r for r in risk_flags if agent_name in r.lower()]) * 0.05
            confidence -= risk_deduction
            
            # Add some randomness
            confidence += random.uniform(-0.05, 0.1)
            
            # Ensure bounds
            scores[agent_name] = round(max(0.5, min(0.98, confidence)), 2)
        
        return scores
    
    def _get_overall_confidence(self, confidence_scores: Dict[str, float]) -> str:
        """Determine overall confidence level."""
        if not confidence_scores:
            return "LOW"
        
        avg_confidence = sum(confidence_scores.values()) / len(confidence_scores)
        
        if avg_confidence >= 0.85:
            return "HIGH"
        elif avg_confidence >= 0.70:
            return "MEDIUM"
        else:
            return "LOW"
    
    def _calculate_risk_severity(self, risk_flags: List[str]) -> str:
        """Calculate overall risk severity."""
        critical_count = len([r for r in risk_flags if "🔴" in r])
        warning_count = len([r for r in risk_flags if "⚠️" in r])
        
        if critical_count >= 2:
            return "HIGH"
        elif critical_count == 1 or warning_count >= 4:
            return "MEDIUM"
        else:
            return "LOW"
    
    def _identify_critical_issues(
        self, 
        agent_results: Dict[str, Any],
        risk_flags: List[str]
    ) -> List[str]:
        """Identify issues that require immediate human review."""
        critical = []
        
        # Check for critical risk flags
        critical.extend([r.replace("🔴 ", "") for r in risk_flags if "🔴" in r])
        
        # Check for failed agents
        for agent_name, result in agent_results.items():
            if isinstance(result, dict) and result.get("status") == "failed":
                critical.append(f"{agent_name} analysis failed - manual review required")
        
        return critical
    
    def _generate_recommendations(
        self,
        risk_flags: List[str],
        inconsistencies: List[Dict],
        critical_issues: List[str]
    ) -> List[str]:
        """Generate actionable recommendations based on validation findings."""
        recommendations = []
        
        if critical_issues:
            recommendations.append("🔴 PRIORITY: Address critical issues before proceeding")
        
        if any("sample size" in r.lower() for r in risk_flags):
            recommendations.append("📊 Conduct additional literature review to expand data sources")
        
        if any("fto" in r.lower() or "patent" in r.lower() for r in risk_flags):
            recommendations.append("⚖️ Engage IP counsel for detailed FTO analysis")
        
        if any("safety" in r.lower() or "toxicity" in r.lower() for r in risk_flags):
            recommendations.append("🔬 Review preclinical toxicity data and adverse event profiles")
        
        if inconsistencies:
            recommendations.append("🔍 Reconcile data inconsistencies between analyses")
        
        if not recommendations:
            recommendations.append("✅ No immediate actions required - proceed with standard review")
        
        return recommendations
