import streamlit as st


def init_session_state():
    if "custom_advisors" not in st.session_state:
        st.session_state.custom_advisors = {}
    if "council_history" not in st.session_state:
        st.session_state.council_history = []


def add_custom_advisor(role, description, expertise):
    expertise_dict = (
        {skill.strip(): 8 for skill in expertise.split(",")}
        if expertise
        else {}
    )
    st.session_state.custom_advisors[role] = {
        "description": description,
        "expertise": expertise_dict,
    }


def remove_custom_advisor(role):
    del st.session_state.custom_advisors[role]


def add_to_history(question, advisors, summary):
    st.session_state.council_history.append(
        {
            "question": question,
            "advisors": advisors,
            "summary": summary,
        }
    )
