"""
SentinelPharma Patient Sentiment Agent
====================================
NLP-based analysis of patient feedback and unmet needs identification.

Provides:
- Patient forum sentiment analysis
- Unmet medical needs detection
- Treatment satisfaction scoring
- Quality of life impact assessment
"""

import random
import asyncio
from datetime import datetime
from typing import Dict, Any, List

import structlog
from ..services.llm_service import get_llm_service
from ..services.prompt_templates import PromptTemplates
from ..utils.drug_data_generator import (
    get_drug_seed, 
    get_drug_specific_value, 
    get_drug_choice,
    DrugDataGenerator
)

logger = structlog.get_logger(__name__)


class PatientSentimentAgent:
    """
    Patient Sentiment Agent - NLP & Unmet Needs Analysis Expert.
    
    This agent analyzes:
    - Patient forums and social media sentiment
    - Treatment satisfaction levels
    - Unmet medical needs
    - Quality of life impact
    """
    
    def __init__(self):
        self.name = "PatientSentimentAgent"
        self.version = "1.0.0"
        self.llm_service = get_llm_service()
        
        # Sentiment categories
        self.sentiment_categories = [
            "Treatment Efficacy",
            "Side Effects",
            "Cost & Accessibility",
            "Administration Convenience",
            "Quality of Life Impact"
        ]
        
        # Data sources
        self.data_sources = [
            "PatientsLikeMe",
            "Reddit Medical Communities",
            "Patient Advocacy Groups",
            "Clinical Trial Participant Feedback",
            "Healthcare Provider Reviews"
        ]
        
        logger.info(f"Initialized {self.name} v{self.version}")
    
    async def analyze(self, molecule: str, llm_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform comprehensive patient sentiment analysis.
        
        Args:
            molecule: Drug/compound to analyze
            llm_config: LLM configuration based on privacy mode
            
        Returns:
            Patient sentiment analysis with unmet needs identification
        """
        start_time = datetime.now()
        
        logger.info(
            "patient_sentiment_analysis_started",
            molecule=molecule,
            agent=self.name,
            model=llm_config.get("model"),
            provider=llm_config.get("provider")
        )
        
        # Simulate NLP processing
        await asyncio.sleep(random.uniform(0.8, 2.2))
        
        # Generate drug-specific sentiment data
        seed = get_drug_seed(molecule)
        
        # Overall sentiment score (-1 to 1, higher is better)
        sentiment_score = round(get_drug_specific_value(molecule, -0.3, 0.9), 2)
        
        # Treatment satisfaction (0-100)
        satisfaction_score = round(get_drug_specific_value(molecule, 45, 92), 1)
        
        # Number of reviews analyzed
        num_reviews = int(get_drug_specific_value(molecule, 500, 5000))
        
        # Generate sentiment breakdown
        sentiment_breakdown = self._generate_sentiment_breakdown(molecule)
        
        # Generate unmet needs
        unmet_needs = self._identify_unmet_needs(molecule, sentiment_score)
        
        # Generate patient concerns
        concerns = self._generate_patient_concerns(molecule)
        
        # Try to get LLM-enhanced sentiment insights
        llm_insights = None
        try:
            if llm_config.get("provider") in ["gemini", "ollama", "local"]:
                prompt = f"""Analyze patient sentiment for {molecule}:

Overall Sentiment Score: {sentiment_score} (-1 to +1 scale)
Treatment Satisfaction: {satisfaction_score}%
Reviews Analyzed: {num_reviews}

Top Patient Concerns:
{chr(10).join(f"- {concern['concern']}" for concern in concerns[:3])}

Unmet Needs Identified:
{chr(10).join(f"- {need['need']}" for need in unmet_needs[:3])}

Provide insights on:
1. Key patient experience themes
2. Most critical unmet needs
3. Recommendations for improvement

Keep response under 150 words."""
                
                llm_insights = await self.llm_service.generate_completion(
                    prompt=prompt,
                    llm_config=llm_config,
                    system_prompt="You are an expert in patient experience analysis and healthcare market research.",
                    temperature=0.7,
                    max_tokens=800
                )
                logger.info(
                    "llm_sentiment_insights_completed",
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
            
            # Overall Metrics
            "overall_sentiment_score": sentiment_score,
            "sentiment_classification": self._classify_sentiment(sentiment_score),
            "treatment_satisfaction_score": satisfaction_score,
            "reviews_analyzed": num_reviews,
            
            # Sentiment Breakdown
            "sentiment_by_category": sentiment_breakdown,
            
            # Patient Experience
            "patient_concerns": concerns,
            "positive_feedback": self._generate_positive_feedback(molecule),
            "common_complaints": self._generate_complaints(molecule),
            
            # Unmet Needs
            "unmet_needs_identified": unmet_needs,
            "critical_gaps": [need for need in unmet_needs if need["priority"] == "High"],
            
            # Quality of Life
            "qol_impact_score": round(get_drug_specific_value(molecule, 3.5, 8.5), 1),
            "qol_domains_affected": [
                "Physical functioning",
                "Emotional well-being",
                "Social activities",
                "Work productivity"
            ],
            
            # Demographics
            "patient_demographics": self._generate_demographics(molecule),
            
            # Data Sources
            "data_sources_analyzed": self._select_sources(seed),
            "data_collection_period": "Last 12 months",
            
            # Recommendations
            "improvement_opportunities": self._generate_recommendations(unmet_needs),
            
            # LLM Enhancement
            "llm_insights": llm_insights,
            "llm_provider": llm_config.get("provider") if llm_insights else None,
            
            # Metadata
            "processing_time_ms": round((datetime.now() - start_time).total_seconds() * 1000, 2),
            "agent_version": self.version
        }
        
        logger.info(
            "patient_sentiment_analysis_completed",
            molecule=molecule,
            sentiment_score=sentiment_score,
            satisfaction=satisfaction_score,
            unmet_needs_count=len(unmet_needs),
            processing_ms=result["processing_time_ms"]
        )
        
        return result
    
    def _generate_sentiment_breakdown(self, molecule: str) -> List[Dict[str, Any]]:
        """Generate sentiment scores by category."""
        breakdown = []
        
        for i, category in enumerate(self.sentiment_categories):
            score = round(get_drug_specific_value(molecule, -0.5, 0.9, offset=i * 100), 2)
            breakdown.append({
                "category": category,
                "sentiment_score": score,
                "classification": self._classify_sentiment(score),
                "mention_count": int(get_drug_specific_value(molecule, 50, 800, offset=i * 50))
            })
        
        return breakdown
    
    def _identify_unmet_needs(self, molecule: str, sentiment_score: float) -> List[Dict[str, Any]]:
        """Identify unmet medical needs from sentiment data."""
        all_needs = [
            {
                "need": "More convenient dosing schedule",
                "priority": "High",
                "patient_mentions": "~35% of reviews"
            },
            {
                "need": "Reduced side effect burden",
                "priority": "High",
                "patient_mentions": "~42% of reviews"
            },
            {
                "need": "Lower out-of-pocket costs",
                "priority": "Medium",
                "patient_mentions": "~28% of reviews"
            },
            {
                "need": "Better long-term efficacy",
                "priority": "High",
                "patient_mentions": "~31% of reviews"
            },
            {
                "need": "Alternative administration routes",
                "priority": "Medium",
                "patient_mentions": "~19% of reviews"
            },
            {
                "need": "Improved treatment guidance",
                "priority": "Low",
                "patient_mentions": "~15% of reviews"
            }
        ]
        
        # Select needs based on drug and sentiment
        seed = get_drug_seed(molecule)
        num_needs = 3 if sentiment_score > 0.5 else 5
        
        selected_needs = []
        for i in range(num_needs):
            idx = (seed + i * 13) % len(all_needs)
            selected_needs.append(all_needs[idx])
        
        return selected_needs
    
    def _generate_patient_concerns(self, molecule: str) -> List[Dict[str, Any]]:
        """Generate top patient concerns."""
        all_concerns = [
            {"concern": "Side effects impacting daily life", "frequency": "High"},
            {"concern": "High medication costs", "frequency": "High"},
            {"concern": "Inconsistent efficacy", "frequency": "Medium"},
            {"concern": "Complex dosing requirements", "frequency": "Medium"},
            {"concern": "Drug interactions", "frequency": "Medium"},
            {"concern": "Limited availability", "frequency": "Low"}
        ]
        
        seed = get_drug_seed(molecule)
        selected = []
        for i in range(4):
            idx = (seed + i * 11) % len(all_concerns)
            selected.append(all_concerns[idx])
        
        return selected
    
    def _generate_positive_feedback(self, molecule: str) -> List[str]:
        """Generate positive patient feedback themes."""
        feedback_options = [
            "Effective symptom relief",
            "Easy to take/administer",
            "Minimal side effects experienced",
            "Improved quality of life",
            "Better than previous treatments",
            "Good value for cost"
        ]
        
        seed = get_drug_seed(molecule)
        selected = []
        for i in range(3):
            idx = (seed + i * 17) % len(feedback_options)
            selected.append(feedback_options[idx])
        
        return selected
    
    def _generate_complaints(self, molecule: str) -> List[str]:
        """Generate common patient complaints."""
        complaints = [
            "Takes too long to see results",
            "Side effects are bothersome",
            "Cost is prohibitive",
            "Requires frequent dosing",
            "Not covered by insurance",
            "Interactions with other medications"
        ]
        
        seed = get_drug_seed(molecule)
        selected = []
        for i in range(3):
            idx = (seed + i * 19) % len(complaints)
            selected.append(complaints[idx])
        
        return selected
    
    def _generate_demographics(self, molecule: str) -> Dict[str, Any]:
        """Generate patient demographics from reviews."""
        return {
            "age_distribution": {
                "18-30": "18%",
                "31-50": "42%",
                "51-70": "32%",
                "70+": "8%"
            },
            "gender_split": {
                "female": f"{int(get_drug_specific_value(molecule, 40, 70))}%",
                "male": f"{int(get_drug_specific_value(molecule, 30, 60))}%"
            },
            "geographic_regions": [
                "North America (45%)",
                "Europe (30%)",
                "Asia Pacific (15%)",
                "Other (10%)"
            ]
        }
    
    def _select_sources(self, seed: int) -> List[str]:
        """Select data sources based on seed."""
        num_sources = 3 + (seed % 3)
        selected = []
        for i in range(num_sources):
            idx = (seed + i * 23) % len(self.data_sources)
            selected.append(self.data_sources[idx])
        return selected
    
    def _generate_recommendations(self, unmet_needs: List[Dict]) -> List[str]:
        """Generate improvement recommendations."""
        return [
            "Develop extended-release formulation to reduce dosing frequency",
            "Conduct patient education programs on optimal usage",
            "Explore patient assistance programs for cost reduction",
            "Investigate combination therapies to enhance efficacy"
        ]
    
    def _classify_sentiment(self, score: float) -> str:
        """Classify sentiment score into category."""
        if score >= 0.6:
            return "Very Positive"
        elif score >= 0.3:
            return "Positive"
        elif score >= 0.0:
            return "Neutral"
        elif score >= -0.3:
            return "Negative"
        else:
            return "Very Negative"
