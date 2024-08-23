import streamlit as st
st.set_page_config(layout="wide", page_title="🐝 HiveSight")  # Needs to be called immediately
import stripe
from supabase import create_client, Client
from st_paywall import add_auth
from st_paywall.google_auth import get_logged_in_user_email, show_login_button

from products.survey.survey import render as render_survey
from products.council.main import render as render_council
from utils.code_utils import gather_code


def init_session_state():
    if "current_product" not in st.session_state:
        st.session_state.current_product = "Home"

    if 'step' not in st.session_state:  # Multistate cost estimation / pay / run
        st.session_state.step = 1
 

def render_home():
    st.title("🐝 HiveSight")

    supabase: Client = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_ROLE_SECRET"])
    stripe.api_key = st.secrets["stripe_api_key_test"]
    
    get_logged_in_user_email()
    
    if "email" not in st.session_state.keys():
        show_login_button(
            text="Login with Google", color="#FD504D", sidebar=True
        )
        st.stop()
    
    if st.sidebar.button("Logout", type="primary"):
        del st.session_state.email
        st.rerun()


    st.write("Choose a product to get started:")

    col1, col2 = st.columns(2)

    st.session_state.step = 1

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
