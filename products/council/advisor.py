import logging
from config import ANTHROPIC_MODEL
import anthropic

logger = logging.getLogger(__name__)
client = anthropic.Anthropic()


def get_advisor_response(question, persona, description, expertise):
    system_prompt = f"""You are the {persona} of an organization. {description or 'Provide advice based on your role.'}
Your areas of expertise are: {', '.join(expertise.keys()) if expertise else 'various areas relevant to your role'}.
Provide your perspective on the given question, considering your role and expertise.
At the end of your response, include:
1. A brief 'Summary' section
2. A 'Key Takeaways' section with 3-5 bullet points
3. A 'Confidence' rating from 1-10 on how confident you are in your advice, given your expertise"""

    try:
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=800,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": f"Please provide your perspective on the following question: {question}",
                }
            ],
        )
        return message.content
    except Exception as e:
        logger.error(f"Error in get_advisor_response: {e}")
        return f"Error: Unable to generate response for {persona}."


def extract_confidence(response):
    import re

    match = re.search(r"Confidence:\s*(\d+)", response, re.IGNORECASE)
    return int(match.group(1)) if match else None


def calculate_expertise_relevance(question, expertise):
    return (
        [
            score
            for skill, score in expertise.items()
            if skill.lower() in question.lower()
        ]
        if expertise
        else []
    )
