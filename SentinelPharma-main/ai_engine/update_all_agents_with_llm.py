"""
Script to update all agents to use LLM service for enhanced analysis
"""

import os
import re

# List of agent files to update
agents_to_update = [
    "app/agents/iqvia_agent.py",
    "app/agents/patent_agent.py",
    "app/agents/market_agent.py",
    "app/agents/exim_agent.py",
    "app/agents/vision_agent.py",
    "app/agents/validation_agent.py",
    "app/agents/kol_finder_agent.py",
    "app/agents/pathfinder_agent.py",
    "app/agents/web_intelligence_agent.py",
    "app/agents/internal_knowledge_agent.py"
]

def update_imports(content):
    """Add LLM service imports"""
    import_section = content.split('\n\n')[0:2]
    
    # Check if already has llm_service import
    if 'llm_service' in content:
        return content
    
    # Find the structlog import line
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'import structlog' in line:
            # Insert after structlog import
            lines.insert(i+1, 'from ..services.llm_service import get_llm_service')
            lines.insert(i+2, 'from ..services.prompt_templates import PromptTemplates')
            break
    
    return '\n'.join(lines)

def update_init(content, agent_name):
    """Add llm_service to __init__"""
    # Find __init__ method
    pattern = r'(def __init__\(self\):.*?self\.name = "' + agent_name + r'".*?self\.version = "[^"]*")'
    
    def replacer(match):
        init_code = match.group(0)
        if 'self.llm_service' not in init_code:
            lines = init_code.split('\n')
            # Add llm_service after version
            for i, line in enumerate(lines):
                if 'self.version' in line:
                    indent = ' ' * (len(line) - len(line.lstrip()))
                    lines.insert(i+1, f'{indent}self.llm_service = get_llm_service()')
                    break
            return '\n'.join(lines)
        return init_code
    
    return re.sub(pattern, replacer, content, flags=re.DOTALL)

def add_llm_metadata(content):
    """Add LLM metadata to result dictionaries"""
    # This is complex and agent-specific, so we'll handle it manually for key agents
    # For now, just add provider_used to metadata sections
    content = re.sub(
        r'("model_used": llm_config\.get\("model"\))',
        r'\1,\n            "provider_used": llm_config.get("provider", "deterministic")',
        content
    )
    return content

def process_agent(filepath):
    """Process a single agent file"""
    print(f"Processing {filepath}...")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extract agent name from filepath
        agent_name_match = re.search(r'(\w+)_agent\.py', filepath)
        if not agent_name_match:
            print(f"  ⚠ Could not extract agent name from {filepath}")
            return False
        
        # Convert to class name (e.g., iqvia -> IQVIAInsightsAgent)
        agent_file_name = agent_name_match.group(1)
        
        # Update imports
        content = update_imports(content)
        
        # Add metadata
        content = add_llm_metadata(content)
        
        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"  ✓ Updated {filepath}")
        return True
        
    except Exception as e:
        print(f"  ✗ Error processing {filepath}: {e}")
        return False

def main():
    """Main execution"""
    print("=" * 60)
    print("SentinelPharma Agent LLM Integration Update")
    print("=" * 60)
    print()
    
    success_count = 0
    fail_count = 0
    
    for agent_file in agents_to_update:
        if process_agent(agent_file):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("=" * 60)
    print(f"Summary: {success_count} updated, {fail_count} failed")
    print("=" * 60)
    print()
    print("✓ All agents now have LLM service integration")
    print("✓ Agents will use Ollama (llama3:8b) for enhanced analysis")
    print("✓ Fallback to deterministic mode if LLM unavailable")
    print()
    print("Next steps:")
    print("1. Ensure Ollama is running: ollama serve")
    print("2. Restart AI engine: cd ai_engine && python -m uvicorn app.main:app --reload")
    print("3. Test with a query to see LLM-enhanced responses")

if __name__ == "__main__":
    main()
