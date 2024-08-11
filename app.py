import streamlit as st

# Set page config at the very beginning
st.set_page_config(layout="wide", page_title="🐝 HiveSight")

from products.survey.survey import render as render_survey
from products.council.main import render as render_council

"""
HiveSight: A multi-product platform for AI-powered insights.

This module serves as the main entry point for the HiveSight application,
handling navigation between different products and rendering the appropriate
interfaces based on user selection.
"""


def init_session_state():
    if "current_product" not in st.session_state:
        st.session_state.current_product = "Home"


def render_navigation():
    st.sidebar.title("🐝 HiveSight")
    products = ["Home", "HiveSight Survey", "HiveSight Council"]
    st.session_state.current_product = st.sidebar.radio("Navigate", products)


def render_home():
    st.title("Welcome to HiveSight")
    st.write("Choose a product from the sidebar to get started.")
    st.write("Our current offerings:")
    st.write("- HiveSight Survey: Simulate public opinion with AI")
    st.write(
        "- HiveSight Council: Get personalized advice from AI-powered executives"
    )


def render_about():
    st.sidebar.title("About")
    st.sidebar.info(
        """
        HiveSight is a multi-product platform for AI-powered insights.
        Choose a product from the navigation menu above.
        
        Built by Max Ghenis and Ben Ogorek
        """
    )


def main():
    init_session_state()
    render_navigation()

    if st.session_state.current_product == "Home":
        render_home()
    elif st.session_state.current_product == "HiveSight Survey":
        render_survey()
    elif st.session_state.current_product == "HiveSight Council":
        render_council()

    render_about()


if __name__ == "__main__":
    main()
