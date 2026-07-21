"""
SentinelPharma KOL (Key Opinion Leader) Finder Agent
==================================================
Identifies top researchers and labs associated with specific molecules/diseases.

Responsibilities:
- Find leading researchers in the field
- Identify key research institutions
- Map publication networks
- Suggest potential collaboration partners
"""

import random
import asyncio
from datetime import datetime
from typing import Dict, Any, List

import structlog
from ..services.llm_service import get_llm_service
from ..services.prompt_templates import PromptTemplates
from ..utils.drug_data_generator import DrugDataGenerator

logger = structlog.get_logger(__name__)


class KOLFinderAgent:
    """
    Key Opinion Leader Identification Agent.
    
    This agent:
    - Identifies top researchers for a molecule/disease pair
    - Maps academic and industry KOLs
    - Analyzes publication and citation networks
    - Suggests potential advisors/collaborators
    """
    
    def __init__(self):
        self.name = "KOLFinderAgent"
        self.version = "1.0.0"
        
        # Mock KOL database
        self.kol_database = self._initialize_kol_database()
        
        logger.info(f"Initialized {self.name} v{self.version}")
    
    def _initialize_kol_database(self) -> Dict[str, List[Dict]]:
        """Initialize mock KOL database by therapeutic area."""
        return {
            "oncology": [
                {"name": "Dr. James Chen", "institution": "Memorial Sloan Kettering", "h_index": 85, "publications": 312, "specialization": "Targeted Therapy"},
                {"name": "Dr. Maria Rodriguez", "institution": "MD Anderson", "h_index": 78, "publications": 289, "specialization": "Immunotherapy"},
                {"name": "Dr. David Kim", "institution": "Dana-Farber", "h_index": 72, "publications": 245, "specialization": "Precision Oncology"},
                {"name": "Dr. Sarah Williams", "institution": "Stanford Medicine", "h_index": 69, "publications": 198, "specialization": "CAR-T Therapy"},
            ],
            "immunology": [
                {"name": "Dr. Michael Thompson", "institution": "NIH", "h_index": 92, "publications": 356, "specialization": "Autoimmune Disorders"},
                {"name": "Dr. Jennifer Lee", "institution": "Harvard Medical", "h_index": 81, "publications": 278, "specialization": "Inflammation"},
                {"name": "Dr. Robert Garcia", "institution": "Johns Hopkins", "h_index": 75, "publications": 234, "specialization": "Transplant Immunology"},
            ],
            "neurology": [
                {"name": "Dr. Emily Brown", "institution": "Cleveland Clinic", "h_index": 88, "publications": 301, "specialization": "Neurodegeneration"},
                {"name": "Dr. William Davis", "institution": "Mayo Clinic", "h_index": 79, "publications": 267, "specialization": "Movement Disorders"},
                {"name": "Dr. Lisa Martinez", "institution": "UCLA", "h_index": 71, "publications": 212, "specialization": "Alzheimer's Research"},
            ],
            "cardiology": [
                {"name": "Dr. John Smith", "institution": "Cleveland Clinic", "h_index": 95, "publications": 402, "specialization": "Heart Failure"},
                {"name": "Dr. Karen Wilson", "institution": "Mayo Clinic", "h_index": 82, "publications": 298, "specialization": "Interventional Cardiology"},
            ],
            "endocrinology": [
                {"name": "Dr. Andrew Taylor", "institution": "Joslin Diabetes Center", "h_index": 76, "publications": 254, "specialization": "Diabetes"},
                {"name": "Dr. Michelle Anderson", "institution": "UCSF", "h_index": 68, "publications": 189, "specialization": "Metabolic Disorders"},
            ]
        }
    
    async def analyze(self, molecule: str, llm_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Find key opinion leaders related to a molecule.
        
        Args:
            molecule: Drug/compound to find KOLs for
            llm_config: LLM configuration
            
        Returns:
            KOL identification results
        """
        start_time = datetime.now()
        
        logger.info(
            "kol_search_started",
            molecule=molecule,
            agent=self.name
        )
        
        # Get drug-specific data
        kol_data = DrugDataGenerator.get_kol_data(molecule)
        
        # Simulate API/database query
        await asyncio.sleep(random.uniform(0.5, 1.2))
        
        # Determine relevant therapeutic areas
        therapeutic_areas = [kol_data["therapeutic_area"]]
        
        # Find KOLs
        academic_kols = self._find_academic_kols(therapeutic_areas)
        industry_kols = self._find_industry_kols(molecule)
        rising_stars = self._find_rising_stars(therapeutic_areas)
        institutions = self._find_key_institutions(therapeutic_areas)
        
        result = {
            "molecule": molecule,
            "analysis_date": datetime.now().isoformat(),
            
            # Therapeutic Context
            "relevant_therapeutic_areas": therapeutic_areas,
            
            # Top Academic KOLs
            "academic_kols": academic_kols,
            "total_academic_kols": len(academic_kols),
            
            # Industry KOLs
            "industry_kols": industry_kols,
            
            # Rising Stars (emerging researchers)
            "rising_stars": rising_stars,
            
            # Key Research Institutions
            "key_institutions": institutions,
            
            # Publication Landscape
            "publication_analysis": {
                "total_publications": random.randint(500, 2000),
                "publications_last_year": random.randint(50, 200),
                "trending_topics": self._generate_trending_topics(),
                "key_journals": self._get_key_journals()
            },
            
            # Conference Activity
            "conference_activity": {
                "upcoming_conferences": self._get_upcoming_conferences(),
                "recent_presentations": random.randint(15, 45)
            },
            
            # Collaboration Network
            "collaboration_suggestions": self._generate_collaboration_suggestions(academic_kols),
            
            # Metadata
            "agent": self.name,
            "version": self.version,
            "model_used": llm_config.get("model"),
            "processing_time_ms": round((datetime.now() - start_time).total_seconds() * 1000, 2)
        }
        
        logger.info(
            "kol_search_completed",
            molecule=molecule,
            kols_found=len(academic_kols)
        )
        
        return result
    
    def _infer_therapeutic_areas(self, molecule: str) -> List[str]:
        """Infer therapeutic areas based on molecule name."""
        molecule_lower = molecule.lower()
        
        areas = []
        
        # Simple keyword matching (in production, use NLP/ML)
        if any(kw in molecule_lower for kw in ['mab', 'zumab', 'ximab', 'umab']):
            areas.append("immunology")
            areas.append("oncology")
        elif any(kw in molecule_lower for kw in ['tinib', 'nib']):
            areas.append("oncology")
        elif any(kw in molecule_lower for kw in ['statin']):
            areas.append("cardiology")
        elif any(kw in molecule_lower for kw in ['metformin', 'gliptin', 'gliflozin']):
            areas.append("endocrinology")
        elif any(kw in molecule_lower for kw in ['pril', 'sartan']):
            areas.append("cardiology")
        else:
            # Default areas
            areas = random.sample(
                ["oncology", "immunology", "neurology", "cardiology", "endocrinology"],
                k=2
            )
        
        return areas
    
    def _find_academic_kols(self, therapeutic_areas: List[str]) -> List[Dict[str, Any]]:
        """Find academic KOLs in relevant therapeutic areas."""
        kols = []
        
        for area in therapeutic_areas:
            if area in self.kol_database:
                area_kols = self.kol_database[area][:3]  # Top 3 per area
                for kol in area_kols:
                    kols.append({
                        **kol,
                        "therapeutic_area": area,
                        "kol_score": round(random.uniform(8.0, 9.8), 1),
                        "recent_citations": random.randint(500, 3000),
                        "clinical_trials_led": random.randint(5, 25)
                    })
        
        # Sort by h-index
        return sorted(kols, key=lambda x: x["h_index"], reverse=True)[:6]
    
    def _find_industry_kols(self, molecule: str) -> List[Dict[str, Any]]:
        """Find industry KOLs associated with the molecule."""
        companies = ["Pfizer", "Novartis", "Roche", "Merck", "AstraZeneca", "BMS"]
        
        return [
            {
                "name": f"Dr. {random.choice(['John', 'Sarah', 'Michael', 'Lisa'])} {random.choice(['Smith', 'Johnson', 'Brown', 'Lee'])}",
                "company": random.choice(companies),
                "role": random.choice(["VP R&D", "Chief Scientific Officer", "Head of Oncology", "Global Medical Lead"]),
                "influence_score": round(random.uniform(7.5, 9.5), 1),
                "linkedin_connections": random.randint(5000, 15000)
            }
            for _ in range(3)
        ]
    
    def _find_rising_stars(self, therapeutic_areas: List[str]) -> List[Dict[str, Any]]:
        """Find emerging researchers (rising stars) in the field."""
        return [
            {
                "name": f"Dr. {random.choice(['Emma', 'Alex', 'Chris', 'Jordan'])} {random.choice(['Zhang', 'Patel', 'Martinez', 'Kim'])}",
                "institution": random.choice(["MIT", "Broad Institute", "UCSD", "University of Cambridge", "ETH Zurich"]),
                "career_stage": "Early Career",
                "h_index": random.randint(15, 35),
                "publications_last_3_years": random.randint(15, 40),
                "notable_achievement": random.choice([
                    "Nature publication on novel drug targets",
                    "NIH New Innovator Award recipient",
                    "Breakthrough discovery in drug delivery",
                    "Leading Phase 1 clinical trial"
                ])
            }
            for _ in range(3)
        ]
    
    def _find_key_institutions(self, therapeutic_areas: List[str]) -> List[Dict[str, Any]]:
        """Find key research institutions."""
        institutions = [
            {"name": "Memorial Sloan Kettering", "type": "Cancer Center", "ranking": 1},
            {"name": "MD Anderson", "type": "Cancer Center", "ranking": 2},
            {"name": "Harvard Medical School", "type": "Academic", "ranking": 1},
            {"name": "NIH/NIAID", "type": "Government", "ranking": 1},
            {"name": "Stanford Medicine", "type": "Academic", "ranking": 3},
            {"name": "Mayo Clinic", "type": "Medical Center", "ranking": 1},
        ]
        
        return [
            {
                **inst,
                "publications_relevant": random.randint(100, 500),
                "active_trials": random.randint(10, 50),
                "collaboration_openness": random.choice(["High", "Medium", "High"])
            }
            for inst in random.sample(institutions, k=4)
        ]
    
    def _generate_trending_topics(self) -> List[str]:
        """Generate trending research topics."""
        topics = [
            "ADC (Antibody-Drug Conjugates)",
            "PROTAC degraders",
            "mRNA therapeutics",
            "Gene editing (CRISPR)",
            "AI-driven drug discovery",
            "Tumor microenvironment",
            "Synthetic lethality",
            "Bispecific antibodies"
        ]
        return random.sample(topics, k=4)
    
    def _get_key_journals(self) -> List[str]:
        """Get key journals in the field."""
        return [
            "Nature Medicine",
            "New England Journal of Medicine",
            "Cell",
            "Journal of Clinical Oncology",
            "The Lancet Oncology"
        ]
    
    def _get_upcoming_conferences(self) -> List[Dict[str, str]]:
        """Get upcoming relevant conferences."""
        conferences = [
            {"name": "ASCO Annual Meeting", "date": "2025-05-30", "location": "Chicago, IL"},
            {"name": "ESMO Congress", "date": "2025-09-12", "location": "Barcelona, Spain"},
            {"name": "ASH Annual Meeting", "date": "2025-12-05", "location": "San Diego, CA"},
            {"name": "AACR Annual Meeting", "date": "2025-04-12", "location": "Philadelphia, PA"},
        ]
        return random.sample(conferences, k=3)
    
    def _generate_collaboration_suggestions(self, kols: List[Dict]) -> List[Dict[str, Any]]:
        """Generate collaboration suggestions based on KOLs."""
        suggestions = []
        
        for kol in kols[:3]:
            suggestions.append({
                "kol_name": kol["name"],
                "institution": kol["institution"],
                "collaboration_type": random.choice([
                    "Advisory Board",
                    "Clinical Trial Investigator",
                    "Sponsored Research",
                    "Consulting"
                ]),
                "strategic_value": random.choice(["High", "Very High", "Medium"]),
                "recommended_approach": random.choice([
                    "Introduce through industry conference",
                    "Reach out via institutional partnership office",
                    "Leverage existing network connections",
                    "Propose joint publication opportunity"
                ])
            })
        
        return suggestions
