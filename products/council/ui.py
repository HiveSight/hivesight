import streamlit as st
from config import DEFAULT_PERSONAS
from .state import add_custom_advisor, remove_custom_advisor


def render_ui():
    render_advisor_management()
    render_history()

    all_advisors = {**DEFAULT_PERSONAS, **st.session_state.custom_advisors}

    question = st.text_input("Enter your question for the advisory council:")

    selected_personas = st.multiselect(
        "Select advisors to consult (2-4 recommended):",
        list(all_advisors.keys()),
        default=(
            ["CEO", "CFO"]
            if "CEO" in all_advisors and "CFO" in all_advisors
            else []
        ),
    )

    max_tokens = st.slider("Max tokens per response", 100, 1000, 800)

    return question, selected_personas, max_tokens


def render_advisor_management():
    st.sidebar.title("Custom Advisors")
    new_role = st.sidebar.text_input("New Advisor Role")
    new_description = st.sidebar.text_area(
        "New Advisor Description (optional)"
    )
    new_expertise = st.sidebar.text_area(
        "New Advisor Expertise (comma-separated, optional)"
    )

    if st.sidebar.button("Add Custom Advisor"):
        if new_role:
            add_custom_advisor(new_role, new_description, new_expertise)
            st.sidebar.success(f"Added {new_role} to custom advisors!")
        else:
            st.sidebar.error("Please provide at least the advisor role.")

    for role, info in st.session_state.custom_advisors.items():
        st.sidebar.text(f"{role}: {info['description'][:50]}...")
        if st.sidebar.button(f"Delete {role}"):
            remove_custom_advisor(role)
            st.sidebar.success(f"Deleted {role} from custom advisors!")
            st.rerun()


def render_history():
    st.sidebar.title("Question History")
    for i, item in enumerate(reversed(st.session_state.council_history), 1):
        if st.sidebar.checkbox(
            f"Q{i}: {item['question'][:30]}...", key=f"history_{i}"
        ):
            st.sidebar.write(f"Advisors: {', '.join(item['advisors'])}")
            st.sidebar.write(f"Summary: {item['summary'][:100]}...")


def display_advisor_response(persona, response):
    st.subheader(f"{persona}'s Advice:")
    st.markdown(response)
    st.markdown("---")


def display_summary(parsed_summary):
    st.subheader("Summary of Advice")
    st.markdown(parsed_summary.get("summary", "Summary not available."))
    st.progress(parsed_summary.get("consensus_level", 5) / 10)
    st.write(
        f"Consensus Level: {parsed_summary.get('consensus_level', 'N/A')}/10"
    )

    with st.expander("Response Sentiments"):
        for persona, sentiment in parsed_summary.get("sentiments", {}).items():
            st.write(f"{persona}: {sentiment}")

    with st.expander("Key Takeaways"):
        for takeaway in parsed_summary.get("key_takeaways", []):
            st.markdown(f"- {takeaway}")


def display_confidence_chart(confidence_df):
    import plotly.express as px

    fig = px.scatter(
        confidence_df,
        x="Confidence",
        y="Avg Relevant Expertise",
        text="Advisor",
        title="Advisor Confidence vs Relevant Expertise",
    )
    fig.update_traces(textposition="top center")
    st.plotly_chart(fig)
