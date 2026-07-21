"""
SentinelPharma Prompt Templates
===========================
Specialized prompts for each AI agent to generate high-quality, domain-specific insights.
"""

from typing import Dict, Any


class PromptTemplates:
    """Centralized prompt templates for all agents"""
    
    @staticmethod
    def iqvia_market_analysis(molecule: str, therapy_area: str, market_data: Dict[str, Any]) -> str:
        """Generate IQVIA market analysis prompt"""
        return f"""You are an expert pharmaceutical market analyst with deep knowledge of IQVIA data and market intelligence.

Analyze the pharmaceutical drug: {molecule}

Therapy Area: {therapy_area}
Market Size (USD Billions): {market_data.get('market_size', 'Unknown')}
CAGR: {market_data.get('cagr', 'Unknown')}
Top Competitors: {', '.join(market_data.get('competitors', []))}

Provide a comprehensive market analysis including:

1. **Market Dynamics**: Explain the current market landscape, growth drivers, and market saturation level
2. **Competitive Intelligence**: Analyze the competitive positioning and differentiation strategies
3. **Therapy Area Trends**: Describe therapy-specific trends and innovation areas
4. **Investment Opportunity**: Assess the attractiveness of this market for new entrants
5. **Strategic Recommendations**: Provide 3-4 actionable recommendations for market entry or expansion

Be specific to {molecule} and its actual use cases. Focus on pharmaceutical industry insights.
Provide concise, data-driven analysis suitable for executive decision-making.

Format your response as clear, structured insights (not JSON)."""
    
    @staticmethod
    def clinical_trial_interpretation(molecule: str, clinical_data: Dict[str, Any]) -> str:
        """Generate clinical trial interpretation prompt"""
        return f"""You are a clinical research expert specializing in pharmaceutical drug development and regulatory affairs.

Analyze clinical trial data for: {molecule}

Trial Statistics:
- Total Trials: {clinical_data.get('total_trials', 0)}
- Phase Distribution: {clinical_data.get('phase_distribution', {})}
- Primary Indications: {', '.join(clinical_data.get('indications', []))}
- Safety Score: {clinical_data.get('safety_score', 'N/A')}/10
- Efficacy Rating: {clinical_data.get('efficacy_rating', 'N/A')}

Provide expert interpretation covering:

1. **Clinical Development Status**: Assess the maturity of the clinical pipeline
2. **Safety Profile**: Interpret the safety data and any concerning signals
3. **Efficacy Assessment**: Evaluate the therapeutic efficacy and clinical significance
4. **Regulatory Outlook**: Predict regulatory pathway and approval likelihood
5. **Risk Factors**: Identify key clinical risks or development challenges
6. **Market Readiness**: Estimate time-to-market based on trial progression

Be specific to {molecule}'s actual therapeutic profile. Use medical terminology appropriately.
Focus on insights relevant to pharmaceutical business strategy."""
    
    @staticmethod
    def web_intelligence_summary(molecule: str, web_data: Dict[str, Any]) -> str:
        """Generate web intelligence summary prompt"""
        return f"""You are a pharmaceutical intelligence analyst specializing in competitive intelligence and market surveillance.

Synthesize web intelligence for: {molecule}

Sources Analyzed:
- Scientific Publications: {web_data.get('publications_count', 0)} papers
- News Articles: {web_data.get('news_count', 0)} recent items
- Clinical Guidelines: {web_data.get('guidelines', [])}
- Regulatory Updates: {web_data.get('regulatory_updates', [])}

Key Publication Titles:
{chr(10).join(['- ' + p for p in web_data.get('publication_titles', [])[:5]])}

Recent News Headlines:
{chr(10).join(['- ' + n for n in web_data.get('news_headlines', [])[:5]])}

Provide intelligence synthesis:

1. **Scientific Landscape**: Summarize key research findings and publication trends
2. **News Sentiment**: Analyze media coverage tone and emerging narratives
3. **Innovation Signals**: Identify breakthrough developments or setbacks
4. **Expert Opinion**: Summarize KOL perspectives and clinical guideline updates
5. **Competitive Moves**: Detect competitor activities from news/publications
6. **Strategic Intelligence**: Provide 3-4 actionable insights for decision-makers

Focus on business-relevant intelligence. Be concise and highlight material developments."""
    
    @staticmethod
    def regulatory_compliance_assessment(molecule: str, regulatory_data: Dict[str, Any]) -> str:
        """Generate regulatory compliance assessment prompt"""
        return f"""You are a regulatory affairs expert with extensive knowledge of FDA pathways, compliance requirements, and drug approval processes.

Assess regulatory compliance for: {molecule}

Regulatory Profile:
- FDA Orange Book Listed: {regulatory_data.get('fda_listed', False)}
- Black Box Warnings: {regulatory_data.get('warning_count', 0)}
- Patent Expiry: {regulatory_data.get('patent_expiry', 'Unknown')}
- Application Type: {regulatory_data.get('application_type', 'NDA')}

Provide regulatory assessment:

1. **Compliance Status**: Evaluate current regulatory standing and compliance level
2. **Regulatory Pathway**: Recommend optimal pathway (505(b)(1), 505(b)(2), 505(j), etc.)
3. **Safety Considerations**: Interpret black box warnings and risk management requirements
4. **Patent & Exclusivity**: Analyze IP protection and generic entry timeline
5. **Approval Timeline**: Estimate time and cost to regulatory approval
6. **Risk Mitigation**: Identify regulatory risks and mitigation strategies

Be specific to {molecule}'s regulatory profile. Cite FDA guidance where relevant."""
    
    @staticmethod
    def patient_sentiment_analysis(molecule: str, sentiment_data: Dict[str, Any]) -> str:
        """Generate patient sentiment analysis prompt"""
        return f"""You are a patient insights specialist analyzing patient-reported experiences and unmet medical needs.

Analyze patient sentiment for: {molecule}

Sentiment Data:
- Overall Sentiment: {sentiment_data.get('overall_sentiment', 'Mixed')}
- Positive Feedback: {sentiment_data.get('positive_pct', 'N/A')}%
- Negative Feedback: {sentiment_data.get('negative_pct', 'N/A')}%
- Treatment Burden Score: {sentiment_data.get('burden_score', 'N/A')}/10

Top Patient Complaints:
{chr(10).join(['- ' + c.get('complaint', '') for c in sentiment_data.get('complaints', [])[:5]])}

Provide patient-centric analysis:

1. **Sentiment Overview**: Summarize patient experiences and satisfaction levels
2. **Unmet Medical Needs**: Identify key gaps in current treatment options
3. **Burden Analysis**: Assess treatment burden (dosing, side effects, cost)
4. **Patient Preferences**: Highlight desired product attributes
5. **Market Opportunity**: Quantify opportunity to address unmet needs
6. **Product Development Insights**: Recommend features for improved patient outcomes

Be empathetic and patient-focused. Identify actionable product improvements."""
    
    @staticmethod
    def esg_sustainability_analysis(molecule: str, esg_data: Dict[str, Any]) -> str:
        """Generate ESG & sustainability analysis prompt"""
        return f"""You are an ESG (Environmental, Social, Governance) analyst specializing in pharmaceutical supply chain sustainability.

Analyze ESG factors for: {molecule}

ESG Profile:
- Overall ESG Score: {esg_data.get('esg_score', 'N/A')}/100
- Environmental Score: {esg_data.get('environmental_score', 'N/A')}/100
- Social Score: {esg_data.get('social_score', 'N/A')}/100
- Governance Score: {esg_data.get('governance_score', 'N/A')}/100
- Carbon Intensity: {esg_data.get('carbon_intensity', 'Unknown')}

Provide ESG assessment:

1. **ESG Overview**: Evaluate overall sustainability performance
2. **Environmental Impact**: Assess carbon footprint and environmental risks
3. **Green Sourcing**: Analyze supplier sustainability and green chemistry opportunities
4. **Social Responsibility**: Evaluate labor practices and community impact
5. **Governance**: Assess corporate governance and ethical standards
6. **Sustainability Roadmap**: Recommend improvements and ESG targets

Focus on material ESG factors for pharmaceutical manufacturing and supply chain."""
    
    @staticmethod
    def exim_trade_analysis(molecule: str, trade_data: Dict[str, Any]) -> str:
        """Generate EXIM trade analysis prompt"""
        return f"""You are an international trade analyst specializing in pharmaceutical APIs and export-import dynamics.

Analyze trade patterns for: {molecule}

Trade Data:
- Total Trade Value: ${trade_data.get('trade_value_usd', 0)}M USD
- Trade Volume: {trade_data.get('volume_mt', 0)} MT
- Supply Risk Level: {trade_data.get('risk_level', 'Unknown')}
- Top Sourcing Countries: {', '.join(trade_data.get('sourcing_hubs', []))}

Provide trade intelligence:

1. **Trade Flow Analysis**: Describe import-export patterns and supply chain structure
2. **Sourcing Strategy**: Evaluate sourcing hub concentration and diversification
3. **Supply Chain Risk**: Assess geopolitical, regulatory, and logistics risks
4. **Cost Optimization**: Identify opportunities for cost reduction
5. **Regulatory Trade Barriers**: Highlight tariffs, quotas, or compliance requirements
6. **Strategic Sourcing**: Recommend optimal sourcing strategy

Focus on API sourcing and pharmaceutical supply chain resilience."""
    
    @staticmethod
    def patent_landscape_interpretation(molecule: str, patent_data: Dict[str, Any]) -> str:
        """Generate patent landscape interpretation prompt"""
        return f"""You are an IP strategy expert specializing in pharmaceutical patents and freedom-to-operate analysis.

Analyze patent landscape for: {molecule}

Patent Profile:
- Active Patents: {patent_data.get('active_patents', 0)}
- Patent Families: {patent_data.get('patent_families', 0)}
- Freedom-to-Operate: {patent_data.get('fto_status', 'Unknown')}
- Earliest Expiry: {patent_data.get('earliest_expiry', 'Unknown')}

Provide IP analysis:

1. **Patent Landscape**: Describe the patent coverage and protection strength
2. **Freedom-to-Operate**: Assess IP risks and clearance requirements
3. **Generic Entry Timing**: Predict when generic competition will emerge
4. **Litigation Risk**: Evaluate patent litigation exposure
5. **IP Strategy**: Recommend offensive/defensive IP strategies
6. **Competitive Positioning**: Analyze competitor patent portfolios

Be specific to pharmaceutical IP strategy and generic drug development."""
    
    @staticmethod
    def validation_cross_check(molecule: str, all_agent_data: Dict[str, Any]) -> str:
        """Generate validation and cross-checking prompt"""
        return f"""You are a pharmaceutical business intelligence validator ensuring data quality and consistency.

Cross-validate analysis for: {molecule}

Agent Outputs Summary:
- IQVIA Market Size: {all_agent_data.get('iqvia', {}).get('market_size', 'N/A')}
- Clinical Trials: {all_agent_data.get('clinical', {}).get('total_trials', 0)} trials
- Regulatory Status: {all_agent_data.get('regulatory', {}).get('compliance_grade', 'N/A')}
- Patient Sentiment: {all_agent_data.get('patient', {}).get('overall_sentiment', 'N/A')}

Provide validation analysis:

1. **Data Consistency**: Check for contradictions across agent outputs
2. **Quality Assessment**: Evaluate data completeness and reliability
3. **Risk Flags**: Identify high-priority concerns or red flags
4. **Confidence Score**: Provide overall confidence in the analysis (0-100)
5. **Missing Data**: Highlight critical gaps requiring further research
6. **Cross-Agent Insights**: Synthesize insights from multiple sources

Focus on actionable validation findings and quality assurance."""


# Singleton instance
prompt_templates = PromptTemplates()
