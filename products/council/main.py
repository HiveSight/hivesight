import logging

import streamlit as st

from utils.openai_utils import estimate_input_tokens
from config import (
    MODEL_MAP,
    MODEL_COST_MAP,
    COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE,
    COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE,
    COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE,
    SUMMARY_MAX_TOKENS
)
from .state import init_session_state
from .ui import render_ui
from .logic import process_advice_request


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def render():
    model_type = "GPT-4o-mini"
    init_session_state()
    st.title("🐝 HiveSight Council")
    st.subheader("AI-Powered Advisory Council")

    question, personas, max_tokens = render_ui()

    # Multi-step proceedure for cost estimation ---------- 
    if 'step' not in st.session_state:
        st.session_state.step = 1
    
    # Step 1: Cost Estimation
    if st.session_state.step == 1:
        if st.button("Proceed to Cost Estimation", help="Get cost estimate and run simulation"):
            if not question.strip():
                st.error("Please enter a statement before running the simulation.")
            else:
       
                # Simplified advisor system token count. Doesn't include expertise or description 
                advisor_system_tokens = len(personas) * estimate_input_tokens(
                    [COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE], model_type
                )
                advisor_user_tokens = len(personas) * estimate_input_tokens(
                    [COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE.format(question=question)],
                    model_type
                )
                # This will be conservative for higher max_token values
                advisor_output_tokens = len(personas) * max_tokens

                # Double counting the bracketed variables, but it's just a few tokens
                summarizer_input_tokens = (advisor_output_tokens +
                    estimate_input_tokens([
                        question,
                        COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE.format(
                            question=question,
                            responses=""  # covered in advisor_output_tokens
                        )
                    ], model_type)
                )
                summarizer_output_tokens = SUMMARY_MAX_TOKENS

                input_tokens_est = (
                    advisor_system_tokens + advisor_user_tokens + summarizer_input_tokens
                )

                output_tokens_est = advisor_output_tokens + summarizer_output_tokens

                input_tokens_cost = input_tokens_est * MODEL_COST_MAP[model_type].Input / 1E6
                output_tokens_cost = output_tokens_est * MODEL_COST_MAP[model_type].Output / 1E6
                total_cost = round(input_tokens_cost + output_tokens_cost, 5)
    
                st.session_state.cost_estimation = {
                    "input_tokens_est": input_tokens_est,
                    "output_tokens_est": output_tokens_est,
                    "total_cost": total_cost,
                    "personas": personas,
                }
                st.session_state.step = 2
                st.rerun()
    
    # Step 2: Run Simulation
    elif st.session_state.step == 2:
        cost_data = st.session_state.cost_estimation
        st.write("#### Cost estimation")
        st.write(f"**Tokens:** {cost_data['input_tokens_est']} input, "
                 f"{cost_data['output_tokens_est']} output")
        st.write(f"**Total Cost:** {cost_data['total_cost']}")

        if st.button("Get Advice", help="Click to start simulation with the current settings."):
            process_advice_request(question, personas, max_tokens)


if __name__ == "__main__":
    render()
