import logging
import re
from typing import Union, List

import anthropic
from anthropic.types import TextBlock

from config import (
    ANTHROPIC_MODEL,
    COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE,
    SUMMARY_MAX_TOKENS
)


logger = logging.getLogger(__name__)
client = anthropic.Anthropic()


def get_summary(question, responses):
    summary_prompt = COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE.format(
        question=question,
        responses=responses
    )
    try:
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=SUMMARY_MAX_TOKENS,
            messages=[{"role": "user", "content": summary_prompt}],
        )
        logger.info(f"Raw API response: {message}")
        return message.content
    except Exception as e:
        logger.error(f"Error in get_summary: {e}", exc_info=True)
        return "Error: Unable to generate summary."


def parse_summary(summary: Union[str, List[TextBlock], TextBlock]) -> dict:
    try:
        logger.info(f"Original summary object: {type(summary)}")

        # Handle TextBlock object or list of TextBlocks
        if (
            isinstance(summary, list)
            and len(summary) > 0
            and isinstance(summary[0], TextBlock)
        ):
            summary = summary[0].text
        elif isinstance(summary, TextBlock):
            summary = summary.text
        elif isinstance(summary, list):
            summary = "\n".join(str(item) for item in summary)
        elif not isinstance(summary, str):
            summary = str(summary)

        logger.info(
            f"Processed summary text: {summary[:100]}..."
        )  # Log first 100 characters

        lines = summary.split("\n")
        parsed_summary = {
            "summary": "Not available",
            "consensus_level": 5,
            "sentiments": {},
            "key_takeaways": [],
        }
        current_section = None

        for line in lines:
            line = line.strip()
            logger.debug(f"Processing line: {line}")
            if line.startswith("SUMMARY:"):
                current_section = "summary"
                parsed_summary[current_section] = line.split(":", 1)[1].strip()
                logger.info(
                    f"Found summary: {parsed_summary[current_section][:50]}..."
                )
            elif line.startswith("CONSENSUS_LEVEL:"):
                try:
                    parsed_summary["consensus_level"] = int(
                        re.search(r"\d+", line).group()
                    )
                    logger.info(
                        f"Found consensus level: {parsed_summary['consensus_level']}"
                    )
                except (ValueError, AttributeError):
                    logger.warning(
                        "Could not parse consensus level, using default value of 5"
                    )
            elif line.startswith("SENTIMENTS:"):
                current_section = "sentiments"
            elif line.startswith("KEY_TAKEAWAYS:"):
                current_section = "key_takeaways"
            elif current_section == "sentiments" and ":" in line:
                persona, sentiment = line.split(":", 1)
                parsed_summary[current_section][
                    persona.strip()
                ] = sentiment.strip()
                logger.info(
                    f"Found sentiment for {persona.strip()}: {sentiment.strip()}"
                )
            elif current_section == "key_takeaways" and line.startswith("-"):
                parsed_summary[current_section].append(line[1:].strip())
                logger.info(f"Found key takeaway: {line[1:].strip()}")

        logger.info(f"Final parsed summary: {parsed_summary}")
        return parsed_summary
    except Exception as e:
        logger.error(f"Error in parse_summary: {e}", exc_info=True)
        return {
            "summary": "Error: Unable to parse summary.",
            "consensus_level": 5,
            "sentiments": {},
            "key_takeaways": [],
        }
