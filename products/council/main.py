import logging

import streamlit as st

from utils.openai_utils import estimate_input_tokens
from config import MODEL_MAP, MODEL_COST_MAP
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

    question_ls, personas, max_tokens = render_ui()

    # Multi-step proceedure for cost estimation and running the simulation b/c nested buttons don't work 
    if 'step' not in st.session_state:
        st.session_state.step = 1
    
    # Step 1: Cost Estimation
    if st.session_state.step == 1:
        if st.button("Proceed to Cost Estimation", help="Get cost estimate and run simulation"):
            if not question_ls.strip():
                st.error("Please enter a statement before running the simulation.")
            else:
        
                input_tokens_est = estimate_input_tokens([question_ls], model_type)
                output_tokens_est = max_tokens * len(personas)
    
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
        st.write(f"**Projected Number of Tokens:** {cost_data['input_tokens_est']} input and {cost_data['output_tokens_est']} output")
        st.write(f"**Projected Cost to Run Simulation:** Total estimate of {cost_data['total_cost']}.")
    
        if st.button("Get Advice", help="Click to start the simulation with the current settings."):
            process_advice_request(question_ls, personas, max_tokens)


if __name__ == "__main__":
    render()
