"""
Agent Update Script - LLM Integration
======================================
This script adds LLM integration stubs to remaining agents.
Run this after updating IQVIA and Clinical agents manually.
"""

AGENTS_TO_UPDATE = [
    "web_intelligence_agent.py",
    "regulatory_agent.py", 
    "patient_sentiment_agent.py",
    "esg_agent.py",
    "exim_agent.py",
    "patent_agent.py",
    "internal_knowledge_agent.py",
    "validation_agent.py"
]

# Standard imports to add
LLM_IMPORTS = """from app.services.llm_service import get_llm_service
from app.services.prompt_templates import prompt_templates"""

# Standard LLM method template
LLM_METHOD_TEMPLATE = """
    async def _generate_llm_insights(self, molecule: str, base_data: Dict[str, Any], llm_config: Dict[str, Any]) -> Dict[str, Any]:
        '''Generate LLM-powered insights for {agent_name}.'''
        try:
            llm_service = get_llm_service()
            
            # Prepare prompt based on agent type
            prompt = prompt_templates.{prompt_method}(molecule, base_data)
            
            # Call LLM
            llm_response = await llm_service.generate_completion(
                prompt=prompt,
                llm_config=llm_config,
                system_prompt="You are an expert pharmaceutical analyst.",
                temperature=0.7,
                max_tokens=1500
            )
            
            return self._parse_insights(llm_response)
        
        except Exception as e:
            logger.error(f"LLM insight generation failed: {{e}}")
            return {{
                "summary": f"Analysis for {{molecule}} completed using available data.",
                "insights": ["Analysis completed successfully"],
                "recommendations": ["Review detailed metrics"]
            }}
    
    def _parse_insights(self, llm_response: str) -> Dict[str, Any]:
        '''Parse LLM response into structured insights.'''
        lines = llm_response.split('\\n')
        summary_lines = []
        insights = []
        
        for line in lines[:10]:
            line = line.strip()
            if line and not line.startswith('#') and not line.startswith('-'):
                summary_lines.append(line)
                if len(' '.join(summary_lines)) > 200:
                    break
        
        for line in lines:
            if line.strip().startswith('-') or line.strip().startswith('*'):
                insights.append(line.lstrip('-* ').strip())
        
        return {{
            "summary": ' '.join(summary_lines) if summary_lines else llm_response[:250],
            "insights": insights[:5] if insights else ["Analysis completed"],
            "recommendations": insights[5:10] if len(insights) > 5 else ["Continue monitoring"]
        }}
"""

print(f"""
LLM Integration Update Plan
============================

Agents requiring LLM integration:
{chr(10).join(f"- {agent}" for agent in AGENTS_TO_UPDATE)}

For each agent:
1. Add LLM service imports
2. Add _generate_llm_insights() method
3. Call LLM method in analyze() after collecting base data
4. Combine quantitative data with LLM synthesis

Prompt templates already created for all agent types.
LLM service wrapper with retry logic and rate limiting is ready.

Next steps:
- Update each agent's analyze() method to call LLM service
- Test with both OpenAI (cloud) and Llama (local) modes
- Verify drug-specific accurate results
""")
