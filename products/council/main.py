import streamlit as st
import logging
from .state import init_session_state
from .ui import render_ui
from .logic import process_advice_request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def render():
    init_session_state()
    st.title("🐝 HiveSight Council")
    st.subheader("AI-Powered Advisory Council")

    question, selected_personas, max_tokens = render_ui()

    if st.button("Get Advice") and question and selected_personas:
        process_advice_request(question, selected_personas, max_tokens)


if __name__ == "__main__":
    render()
