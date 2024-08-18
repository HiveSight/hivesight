import streamlit as st
import pandas as pd
import logging
from config import DEFAULT_PERSONAS
from .advisor import (
    get_advisor_response,
    extract_confidence,
    calculate_expertise_relevance,
)
from .summary import get_summary, parse_summary
from .analysis import analyze_responses
from .utils import parse_response
from .state import add_to_history
from .ui import (
    display_advisor_response,
    display_summary,
    display_confidence_chart,
)

logger = logging.getLogger(__name__)


def process_advice_request(question, selected_personas, max_tokens):
    all_advisors = {**DEFAULT_PERSONAS, **st.session_state.custom_advisors}
    responses = {}
    confidences = {}
    expertise_scores = {}

    for persona in selected_personas:
        with st.spinner(f"Consulting {persona}..."):
            advisor_info = all_advisors[persona]
            response = get_advisor_response(
                question,
                persona,
                advisor_info.get("description"),
                advisor_info.get("expertise"),
                max_tokens
            )
            parsed_response = parse_response(response)
            responses[persona] = parsed_response
            display_advisor_response(persona, parsed_response)

            confidences[persona] = extract_confidence(parsed_response) or 5
            expertise_scores[persona] = calculate_expertise_relevance(
                question, advisor_info.get("expertise", {})
            )

    if responses:
        with st.spinner("Analyzing advice..."):
            formatted_responses = "\n\n".join(
                f"{persona}: {response}"
                for persona, response in responses.items()
            )
            summary = get_summary(question, formatted_responses)
            logger.info(f"Raw summary: {summary}")
            parsed_summary = parse_summary(summary)
            logger.info(f"Parsed summary: {parsed_summary}")

            if (
                parsed_summary["summary"] != "Not available"
                and parsed_summary["summary"]
                != "Error: Unable to parse summary."
            ):
                display_summary(parsed_summary)
            else:
                st.error(
                    "An error occurred while parsing the summary. Please try again."
                )

            st.subheader("Advisor Confidence and Expertise")
            analysis = analyze_responses(
                responses, confidences, expertise_scores
            )
            confidence_df = pd.DataFrame(
                {
                    "Advisor": list(confidences.keys()),
                    "Confidence": list(confidences.values()),
                    "Avg Relevant Expertise": [
                        sum(scores) / len(scores) if scores else 0
                        for scores in expertise_scores.values()
                    ],
                }
            )
            display_confidence_chart(confidence_df)

        add_to_history(
            question,
            selected_personas,
            parsed_summary.get("summary", "Summary not available"),
        )
