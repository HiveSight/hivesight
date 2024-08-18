import logging

import anthropic

from config import (
    ANTHROPIC_MODEL,
    COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE,
    COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE
)


logger = logging.getLogger(__name__)
client = anthropic.Anthropic()


def get_advisor_response(question, persona, description, expertise, max_tokens):

    description_text = description if description else 'Provide advice based on your role.'
    expertise_text = (
        ', '.join(expertise.keys()) if expertise else 'various areas relevant to your role'
    )

    system_prompt = COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE.format(
        persona=persona,
        description=description_text,
        expertise=expertise_text
    )

    try:
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE.format(question=question)
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
