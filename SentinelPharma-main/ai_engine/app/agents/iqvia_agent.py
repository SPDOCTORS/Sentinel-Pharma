"""
SentinelPharma IQVIA Insights Agent (Market Intelligence)
=======================================================
Commercial viability analysis using IQVIA-style market data.

Responsibilities:
- Retrieve Global Market Size
- Calculate 5-Year CAGR
- Identify Volume Shifts (Tablet → Injectable, etc.)
- List Top Competitors by market share
- Generate Sales Trend analytics
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


class IQVIAInsightsAgent:
    """
    IQVIA Insights Agent - Commercial Viability Expert.
    
    This agent provides market intelligence similar to IQVIA analytics:
    - Market sizing and segmentation
    - Sales trends and forecasts
    - Competitive landscape analysis
    - Volume shift analysis
    """
    
    def __init__(self):
        self.name = "IQVIAInsightsAgent"
        self.version = "1.0.0"
        self.llm_service = get_llm_service()
        
        # Therapeutic areas and their typical market sizes
        self.therapy_areas = {
            "oncology": {"base_size": 150, "growth": 12.5},
            "immunology": {"base_size": 80, "growth": 10.2},
            "neurology": {"base_size": 60, "growth": 8.5},
            "cardiology": {"base_size": 55, "growth": 5.2},
            "metabolic": {"base_size": 90, "growth": 7.8},
            "infectious": {"base_size": 45, "growth": 6.5},
            "rare_disease": {"base_size": 25, "growth": 15.0}
        }
        
        logger.info(f"Initialized {self.name} v{self.version}")
    
    async def analyze(self, molecule: str, llm_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform comprehensive market intelligence analysis.
        
        Args:
            molecule: Drug/compound to analyze
            llm_config: LLM configuration
            
        Returns:
            IQVIA-style market intelligence report
        """
        start_time = datetime.now()
        
        logger.info(
            "iqvia_analysis_started",
            molecule=molecule,
            agent=self.name
        )
        
        # Simulate IQVIA API query
        await asyncio.sleep(random.uniform(0.6, 1.3))
        
        # Get drug-specific market data
        iqvia_data = DrugDataGenerator.get_iqvia_data(molecule)
        
        # Determine therapy area
        therapy_area = self._infer_therapy_area(molecule)
        
        # Generate comprehensive analysis using drug-specific data
        market_size = self._analyze_market_size(molecule, therapy_area, iqvia_data)
        cagr_analysis = self._calculate_cagr(therapy_area, iqvia_data)
        sales_trends = self._analyze_sales_trends(molecule, iqvia_data)
        volume_shifts = self._identify_volume_shifts(molecule)
        competitors = self._analyze_competitors(molecule)
        market_segments = self._analyze_segments(molecule)
        regional_breakdown = self._analyze_regional_markets(molecule)
        
        # Try to get LLM-enhanced market strategy
        llm_market_strategy = None
        try:
            if llm_config.get("provider") in ["gemini", "ollama", "local"]:
                prompt = f"""Analyze the commercial opportunity for {molecule}:

Therapy Area: {therapy_area}
Global Market Size: ${iqvia_data['global_market_size_usd_bn']}B
Market Share: {iqvia_data['market_share_percent']}%
5-Year CAGR: {iqvia_data['five_year_cagr']}%
Sales Trend: {iqvia_data['sales_trend']}

Provide concise commercial strategy covering:
1. Market entry opportunities
2. Competitive positioning
3. Revenue growth drivers

Keep response under 150 words."""
                
                llm_market_strategy = await self.llm_service.generate_completion(
                    prompt=prompt,
                    llm_config=llm_config,
                    system_prompt="You are an expert pharmaceutical market analyst with IQVIA experience.",
                    temperature=0.6,
                    max_tokens=800
                )
                logger.info(
                    "llm_market_strategy_completed",
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
            "therapy_area": therapy_area,
            
            # Market Size Analysis
            "market_size": market_size,
            "global_market_size_usd_bn": iqvia_data["global_market_size_usd_bn"],
            
            # CAGR Analysis (5-Year)
            "cagr_analysis": cagr_analysis,
            "five_year_cagr": iqvia_data["five_year_cagr"],
            
            # Sales Trends
            "sales_trends": sales_trends,
            "sales_trend_direction": sales_trends["trend_direction"],
            
            # Volume Shifts
            "volume_shifts": volume_shifts,
            "primary_shift": volume_shifts[0] if volume_shifts else None,
            
            # Competitive Landscape
            "competitive_landscape": competitors,
            "top_5_competitors": competitors["top_5"],
            "market_concentration": competitors["concentration"],
            
            # Market Segmentation
            "market_segments": market_segments,
            
            # Regional Analysis
            "regional_breakdown": regional_breakdown,
            
            # Forecasts
            "market_forecast": {
                "2025": round(market_size["total_market_usd_bn"] * 1.08, 2),
                "2026": round(market_size["total_market_usd_bn"] * 1.17, 2),
                "2027": round(market_size["total_market_usd_bn"] * 1.27, 2),
                "2028": round(market_size["total_market_usd_bn"] * 1.38, 2),
                "2030": round(market_size["total_market_usd_bn"] * 1.63, 2)
            },
            
            # Investment Metrics
            "investment_metrics": {
                "market_attractiveness_score": round(random.uniform(6.5, 9.5), 1),
                "entry_barriers": random.choice(["High", "Medium", "Low"]),
                "profitability_index": round(random.uniform(1.2, 2.5), 2),
                "time_to_peak_sales_years": random.randint(3, 8)
            },
            
            # Data Sources
            "data_sources": ["IQVIA MIDAS", "IQVIA NSP", "Symphony Health", "Evaluate Pharma"],
            
            # LLM Enhancement
            "llm_market_strategy": llm_market_strategy,
            "llm_provider": llm_config.get("provider") if llm_market_strategy else None,
            
            # Metadata
            "agent": self.name,
            "version": self.version,
            "model_used": llm_config.get("model"),
            "processing_time_ms": round((datetime.now() - start_time).total_seconds() * 1000, 2)
        }
        
        logger.info(
            "iqvia_analysis_completed",
            molecule=molecule,
            market_size_bn=result["global_market_size_usd_bn"]
        )
        
        return result
    
    def _infer_therapy_area(self, molecule: str) -> str:
        """Infer therapy area from molecule name."""
        molecule_lower = molecule.lower()
        
        if any(kw in molecule_lower for kw in ['mab', 'tinib', 'ciclib', 'zumab']):
            return "oncology"
        elif any(kw in molecule_lower for kw in ['statin', 'pril', 'sartan']):
            return "cardiology"
        elif any(kw in molecule_lower for kw in ['metformin', 'gliptin', 'gliflozin']):
            return "metabolic"
        elif any(kw in molecule_lower for kw in ['vir', 'cillin', 'mycin']):
            return "infectious"
        else:
            return random.choice(list(self.therapy_areas.keys()))
    
    def _analyze_market_size(self, molecule: str, therapy_area: str, iqvia_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market size for the therapy area."""
        total_market = iqvia_data["global_market_size_usd_bn"]
        molecule_share = iqvia_data["market_share_percent"] / 100
        
        return {
            "therapy_area_market_usd_bn": round(total_market, 2),
            "total_market_usd_bn": round(total_market, 2),
            "molecule_market_usd_bn": round(total_market * molecule_share, 2),
            "molecule_market_share": f"{molecule_share * 100:.1f}%",
            "market_growth_rate": f"{iqvia_data['five_year_cagr']:.1f}%",
            "market_maturity": iqvia_data["sales_trend"],
            "market_size_ranking": f"#{int(molecule_share * 100)} in {therapy_area.title()}"
        }
    
    def _calculate_cagr(self, therapy_area: str, iqvia_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate 5-year CAGR analysis."""
        base_cagr = iqvia_data["five_year_cagr"]
        
        return {
            "five_year_cagr": f"{base_cagr:.1f}%",
            "historical_cagr_3y": f"{base_cagr * 0.9:.1f}%",
            "projected_cagr_5y": f"{base_cagr * 1.1:.1f}%",
            "cagr_breakdown": {
                "volume_growth": f"{base_cagr * 0.4:.1f}%",
                "price_growth": f"{base_cagr * 0.3:.1f}%",
                "mix_improvement": f"{base_cagr * 0.3:.1f}%"
            },
            "cagr_table": [
                {"period": "2020-2022", "cagr": f"{base_cagr * 0.9:.1f}%", "driver": "COVID impact"},
                {"period": "2022-2024", "cagr": f"{base_cagr * 1.1:.1f}%", "driver": "Recovery & new launches"},
                {"period": "2024-2026F", "cagr": f"{base_cagr:.1f}%", "driver": "Normalized growth"},
                {"period": "2026-2028F", "cagr": f"{base_cagr * 0.95:.1f}%", "driver": "Maturation"}
            ],
            "growth_drivers": [
                "Aging population demographics",
                "Increasing disease prevalence",
                "Novel therapy adoption",
                "Emerging market expansion"
            ]
        }
    
    def _analyze_sales_trends(self, molecule: str, iqvia_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze sales trends."""
        quarters = ["Q1'23", "Q2'23", "Q3'23", "Q4'23", "Q1'24", "Q2'24", "Q3'24", "Q4'24"]
        base_sales = random.uniform(500, 2000)
        
        # Generate trending sales data
        sales_data = []
        for i, q in enumerate(quarters):
            growth = 1 + (random.uniform(0.02, 0.08) * (i / len(quarters)))
            seasonal = 1 + random.uniform(-0.05, 0.05)
            sales_data.append({
                "quarter": q,
                "sales_usd_million": round(base_sales * growth * seasonal, 1)
            })
        
        # Determine trend
        first_half_avg = sum(s["sales_usd_million"] for s in sales_data[:4]) / 4
        second_half_avg = sum(s["sales_usd_million"] for s in sales_data[4:]) / 4
        
        if second_half_avg > first_half_avg * 1.1:
            trend = "Strong Growth ↑"
        elif second_half_avg > first_half_avg * 1.02:
            trend = "Moderate Growth ↗"
        elif second_half_avg < first_half_avg * 0.95:
            trend = "Declining ↓"
        else:
            trend = "Stable →"
        
        return {
            "quarterly_sales": sales_data,
            "trend_direction": trend,
            "yoy_growth": f"{random.randint(5, 25)}%",
            "qoq_growth": f"{random.randint(-5, 15)}%",
            "seasonality_impact": random.choice(["Low", "Medium", "High"]),
            "sales_chart_data": {
                "labels": quarters,
                "values": [s["sales_usd_million"] for s in sales_data]
            }
        }
    
    def _identify_volume_shifts(self, molecule: str) -> List[Dict[str, Any]]:
        """Identify volume/formulation shifts in the market."""
        shifts = []
        
        # Common formulation shifts
        shift_patterns = [
            {"from": "Oral Tablet", "to": "Extended Release", "driver": "Improved compliance"},
            {"from": "IV Infusion", "to": "Subcutaneous", "driver": "Self-administration convenience"},
            {"from": "Branded", "to": "Generic", "driver": "Patent expiry"},
            {"from": "Small Molecule", "to": "Biologic", "driver": "Improved efficacy"},
            {"from": "Monotherapy", "to": "Combination", "driver": "Enhanced outcomes"},
            {"from": "Hospital", "to": "Retail/Specialty", "driver": "Shift to outpatient care"}
        ]
        
        # Select relevant shifts
        num_shifts = random.randint(2, 4)
        selected = random.sample(shift_patterns, num_shifts)
        
        for shift in selected:
            shifts.append({
                "shift_from": shift["from"],
                "shift_to": shift["to"],
                "shift_magnitude": f"{random.randint(10, 40)}%",
                "driver": shift["driver"],
                "impact_timeline": f"{random.randint(2, 5)} years",
                "market_impact_usd_bn": round(random.uniform(0.5, 5.0), 2)
            })
        
        return shifts
    
    def _analyze_competitors(self, molecule: str) -> Dict[str, Any]:
        """Analyze competitive landscape."""
        # Major pharma companies
        companies = [
            "Pfizer", "Novartis", "Roche", "Merck & Co", "Johnson & Johnson",
            "AbbVie", "Bristol-Myers Squibb", "AstraZeneca", "Sanofi", "Eli Lilly",
            "GSK", "Gilead", "Amgen", "Biogen", "Regeneron"
        ]
        
        # Generate market share distribution
        shares = []
        remaining = 100
        selected = random.sample(companies, 5)
        
        for i, company in enumerate(selected):
            if i < 4:
                min_val = max(5, remaining // 3)
                max_val = max(min_val + 1, min(35, remaining - 10))  # Ensure max_val > min_val
                share = random.randint(min_val, max_val)
                remaining -= share
            else:
                share = max(0, remaining)  # Last one gets the rest
            
            shares.append({
                "rank": i + 1,
                "company": company,
                "market_share": f"{share}%",
                "key_product": f"{company} {random.choice(['Lead', 'Core', 'Star'])} Product",
                "yoy_share_change": f"{random.randint(-5, 8):+d}pp"
            })
        
        # Calculate concentration (HHI-like metric)
        share_values = [int(s["market_share"].replace("%", "")) for s in shares]
        concentration = "High" if share_values[0] > 30 else "Medium" if share_values[0] > 20 else "Fragmented"
        
        return {
            "top_5": shares,
            "concentration": concentration,
            "hhi_index": sum(s**2 for s in share_values),
            "new_entrants_last_2y": random.randint(2, 8),
            "competitive_intensity": random.choice(["High", "Medium", "Very High"]),
            "key_competitive_factors": [
                "Efficacy differentiation",
                "Pricing strategy",
                "Market access",
                "Pipeline strength"
            ]
        }
    
    def _analyze_segments(self, molecule: str) -> Dict[str, Any]:
        """Analyze market segmentation."""
        return {
            "by_product_type": [
                {"segment": "Innovator/Branded", "share": f"{random.randint(40, 70)}%"},
                {"segment": "Generic", "share": f"{random.randint(20, 45)}%"},
                {"segment": "Biosimilar", "share": f"{random.randint(5, 20)}%"}
            ],
            "by_distribution": [
                {"channel": "Retail Pharmacy", "share": f"{random.randint(30, 50)}%"},
                {"channel": "Hospital", "share": f"{random.randint(25, 40)}%"},
                {"channel": "Specialty Pharmacy", "share": f"{random.randint(15, 30)}%"},
                {"channel": "Mail Order", "share": f"{random.randint(5, 15)}%"}
            ],
            "by_payer": [
                {"payer": "Commercial Insurance", "share": f"{random.randint(40, 55)}%"},
                {"payer": "Medicare", "share": f"{random.randint(25, 35)}%"},
                {"payer": "Medicaid", "share": f"{random.randint(10, 20)}%"},
                {"payer": "Self-Pay/Other", "share": f"{random.randint(5, 15)}%"}
            ]
        }
    
    def _analyze_regional_markets(self, molecule: str) -> Dict[str, Any]:
        """Analyze regional market breakdown."""
        return {
            "by_region": [
                {"region": "North America", "share": f"{random.randint(40, 55)}%", "growth": f"{random.randint(5, 12)}%"},
                {"region": "Europe", "share": f"{random.randint(20, 30)}%", "growth": f"{random.randint(3, 8)}%"},
                {"region": "Asia-Pacific", "share": f"{random.randint(15, 25)}%", "growth": f"{random.randint(10, 18)}%"},
                {"region": "Latin America", "share": f"{random.randint(3, 8)}%", "growth": f"{random.randint(6, 12)}%"},
                {"region": "Rest of World", "share": f"{random.randint(2, 7)}%", "growth": f"{random.randint(4, 10)}%"}
            ],
            "fastest_growing_region": "Asia-Pacific",
            "largest_market": "North America",
            "emerging_opportunities": ["China", "India", "Brazil"]
        }
    
    async def calculate_roi(self, molecule: str) -> Dict[str, Any]:
        """Calculate ROI metrics (backward compatibility)."""
        llm_config = {"model": "internal", "provider": "internal"}
        analysis = await self.analyze(molecule, llm_config)
        
        # Extract ROI-relevant data
        return {
            "molecule": molecule,
            "market_size_billions": analysis["global_market_size_usd_bn"],
            "five_year_cagr": analysis["cagr_analysis"]["five_year_cagr"],
            "roi_percentage": round(random.uniform(150, 400), 1),
            "probability_of_success": f"{random.randint(55, 85)}%",
            "time_to_market_years": random.uniform(2.5, 5.0),
            "npv_millions": round(random.uniform(100, 800), 1),
            "recommendation": random.choice(["STRONG_BUY", "BUY", "HOLD"]),
            "risk_level": random.choice(["LOW", "MEDIUM", "MEDIUM"]),
            "processing_time_ms": analysis["processing_time_ms"]
        }
