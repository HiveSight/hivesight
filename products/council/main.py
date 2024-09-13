import logging

import streamlit as st

from utils.openai_utils import estimate_input_tokens
from utils.credit_utils import (
    get_or_create_stripe_customer,
    get_credits_available,
    get_number_of_credits_with_purchase,
    get_stripe_checkout_url,
    update_credit_usage_history,
    add_extra_credits,
    create_credit_purchase_sidebar,
    create_free_credits_sidebar
)
from config import (
    MODEL_COST_MAP,
    ADVISOR_MODEL_TYPE,
    SUMMARIZER_MODEL_TYPE,
    COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE,
    COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE,
    COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE,
    SUMMARY_MAX_TOKENS,
)
from .state import init_session_state
from .ui import render_ui
from .logic import process_advice_request


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def render():
    init_session_state()
    st.title("🐝 HiveSight Council")
    st.subheader("AI-Powered Advisory Council")

    create_credit_purchase_sidebar()
    question, personas, max_tokens = render_ui()


    # Multi-step proceedure for cost estimation ----------
    if "step" not in st.session_state:
        st.session_state.step = 1

    # Step 1: Cost Estimation
    if st.session_state.step == 1:
        if st.button(
            "Proceed to Cost Estimation",
            help="Get cost estimate and run simulation",
        ):
            if not question.strip():
                st.error(
                    "Please enter a statement before running the simulation."
                )
            else:

                # Simplified advisor system token count. Doesn't include expertise or description
                advisor_system_tokens = len(personas) * estimate_input_tokens(
                    [COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE], ADVISOR_MODEL_TYPE 
                )
                advisor_user_tokens = len(personas) * estimate_input_tokens(
                    [
                        COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE.format(
                            question=question
                        )
                    ],
                    ADVISOR_MODEL_TYPE,
                )
                # This will be conservative for higher max_token values
                advisor_output_tokens = len(personas) * max_tokens

                # Double counting the bracketed variables, but it's just a few tokens
                summarizer_input_tokens = advisor_output_tokens + estimate_input_tokens(
                    [
                        question,
                        COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE.format(
                            question=question,
                            responses="",  # covered in advisor_output_tokens
                        ),
                    ],
                    SUMMARIZER_MODEL_TYPE,
                )
                summarizer_output_tokens = SUMMARY_MAX_TOKENS

                advisor_input_tokens_cost = (
                    (advisor_system_tokens + advisor_user_tokens)
                    * MODEL_COST_MAP[ADVISOR_MODEL_TYPE].Input / 1E6
                )
                advisor_output_tokens_cost = (
                    advisor_output_tokens * MODEL_COST_MAP[ADVISOR_MODEL_TYPE].Output / 1E6
                )
                summarizer_input_tokens_cost = (
                    summarizer_input_tokens
                    * MODEL_COST_MAP[SUMMARIZER_MODEL_TYPE].Input / 1E6
                )
                summarizer_output_tokens_cost = (
                    summarizer_output_tokens * MODEL_COST_MAP[SUMMARIZER_MODEL_TYPE].Output / 1E6
                )

                total_cost = round(
                    advisor_input_tokens_cost
                    + advisor_output_tokens_cost
                    + summarizer_input_tokens_cost
                    + summarizer_output_tokens_cost,
                    4  # rounds costs to the 100th of a cent
                )
                total_cost_in_credits = round(total_cost * CREDITS_TO_USD_MULTIPLIER)

                st.session_state.cost_estimation = {
                    "total_cost": total_cost,
                    "total_cost_in_credits": total_cost_in_credits,
                    "personas": personas,
                }
                st.session_state.step = 2
                st.rerun()

    # Step 2: Run Simulation
    elif st.session_state.step == 2:

        cost_data = st.session_state.cost_estimation
        st.write("#### Cost estimation")
        st.write(f"**Total Cost (to developers) in USD for Simulation:** ${cost_data['total_cost']}")
        st.write(f"**Credits Required (for user):** {cost_data['total_cost_in_credits']}")

        credits_available = get_credits_available(st.session_state["email"])
        st.write(f"**User Credits** (at time of cost estimation): {credits_available:,}")

        create_free_credits_sidebar()

        enough_credits = credits_available >= cost_data['total_cost_in_credits']
        if enough_credits:
            if st.button("Get Advice", help="Click to start the simulation with the current settings."):
                update_credit_usage_history(st.session_state['email'], cost_data['total_cost_in_credits'])
                process_advice_request(question, personas, max_tokens)
        else:
            st.write("Not enough credits! See the sidebar to buy more.")


if __name__ == "__main__":
    render()
