import streamlit as st

# Set page config at the very beginning
st.set_page_config(layout="wide", page_title="🐝 HiveSight")

from products.survey.survey import render as render_survey
from products.council.main import render as render_council
from utils.code_utils import gather_code


def init_session_state():
    if "current_product" not in st.session_state:
        st.session_state.current_product = "Home"


def render_home():
    st.title("🐝 HiveSight")
    st.write("Choose a product to get started:")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("HiveSight Survey", use_container_width=True):
            st.session_state.current_product = "HiveSight Survey"
            st.rerun()

    with col2:
        if st.button("HiveSight Council", use_container_width=True):
            st.session_state.current_product = "HiveSight Council"
            st.rerun()


def render_about():
    st.sidebar.title("About")
    st.sidebar.info(
        """
        HiveSight is a multi-product platform for AI-powered insights.
        Choose a product from the navigation menu above.

        Built by Max Ghenis and Ben Ogorek
        """
    )


def render_developer_tools():
    st.sidebar.title("Developer Tools")
    if st.sidebar.button("Gather All Code"):
        all_code = gather_code()
        st.sidebar.download_button(
            label="Download All Code",
            data=all_code,
            file_name="hivesight_all_code.py",
            mime="text/plain",
        )

    with st.sidebar.expander("View All Code"):
        st.code(gather_code(), language="python")


def render_sidebar():
    st.sidebar.title("Navigation")
    products = ["Home", "HiveSight Survey", "HiveSight Council"]
    selected_product = st.sidebar.radio("Choose a product:", products)
    if selected_product != st.session_state.current_product:
        st.session_state.current_product = selected_product
        st.rerun()

    render_about()
    render_developer_tools()


def main():
    init_session_state()

    if st.session_state.current_product == "Home":
        render_home()
        render_sidebar()
    elif st.session_state.current_product == "HiveSight Survey":
        render_survey()
        if st.sidebar.button("Back to Home"):
            st.session_state.current_product = "Home"
            st.rerun()
    elif st.session_state.current_product == "HiveSight Council":
        render_council()
        if st.sidebar.button("Back to Home"):
            st.session_state.current_product = "Home"
            st.rerun()


if __name__ == "__main__":
    main()
