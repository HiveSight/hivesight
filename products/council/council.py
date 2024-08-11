import streamlit as st
import pandas as pd
import plotly.express as px
from products.council.utils import (
    get_advisor_response,
    get_summary,
    parse_response,
    extract_confidence,
    calculate_expertise_relevance,
    parse_summary,
)
from config import DEFAULT_PERSONAS


def init_session_state():
    if "custom_advisors" not in st.session_state:
        st.session_state.custom_advisors = {}
    if "council_history" not in st.session_state:
        st.session_state.council_history = []


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
            expertise_dict = (
                {skill.strip(): 8 for skill in new_expertise.split(",")}
                if new_expertise
                else {}
            )
            st.session_state.custom_advisors[new_role] = {
                "description": new_description,
                "expertise": expertise_dict,
            }
            st.sidebar.success(f"Added {new_role} to custom advisors!")
        else:
            st.sidebar.error("Please provide at least the advisor role.")

    for role, info in st.session_state.custom_advisors.items():
        st.sidebar.text(f"{role}: {info['description'][:50]}...")
        if st.sidebar.button(f"Delete {role}"):
            del st.session_state.custom_advisors[role]
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


def render():
    init_session_state()
    st.title("🐝 HiveSight Council")
    st.subheader("AI-Powered Advisory Council")

    render_advisor_management()

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

    if st.button("Get Advice") and question and selected_personas:
        responses = {}
        confidences = {}
        expertise_scores = {}

        for persona in selected_personas:
            st.subheader(f"{persona}'s Advice:")
            with st.spinner(f"Consulting {persona}..."):
                advisor_info = all_advisors[persona]
                response = get_advisor_response(
                    question,
                    persona,
                    advisor_info.get("description"),
                    advisor_info.get("expertise"),
                )
                parsed_response = parse_response(response)
                responses[persona] = parsed_response
                st.markdown(parsed_response)

                confidences[persona] = extract_confidence(parsed_response) or 5
                expertise_scores[persona] = calculate_expertise_relevance(
                    question, advisor_info.get("expertise", {})
                )
            st.markdown("---")

        if responses:
            st.subheader("Summary of Advice")
            with st.spinner("Analyzing advice..."):
                formatted_responses = "\n\n".join(
                    f"{persona}: {response}"
                    for persona, response in responses.items()
                )
                summary = get_summary(question, formatted_responses)
                parsed_summary = parse_summary(summary)

                st.markdown(
                    parsed_summary.get("summary", "Summary not available.")
                )
                st.progress(parsed_summary.get("consensus_level", 5) / 10)
                st.write(
                    f"Consensus Level: {parsed_summary.get('consensus_level', 'N/A')}/10"
                )

                with st.expander("Response Sentiments"):
                    for persona, sentiment in parsed_summary.get(
                        "sentiments", {}
                    ).items():
                        st.write(f"{persona}: {sentiment}")

                with st.expander("Key Takeaways"):
                    for takeaway in parsed_summary.get("key_takeaways", []):
                        st.markdown(f"- {takeaway}")

                st.subheader("Advisor Confidence and Expertise")
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
                fig = px.scatter(
                    confidence_df,
                    x="Confidence",
                    y="Avg Relevant Expertise",
                    text="Advisor",
                    title="Advisor Confidence vs Relevant Expertise",
                )
                fig.update_traces(textposition="top center")
                st.plotly_chart(fig)

            # Add to history
            st.session_state.council_history.append(
                {
                    "question": question,
                    "advisors": selected_personas,
                    "summary": parsed_summary.get(
                        "summary", "Summary not available"
                    ),
                }
            )

    render_history()


if __name__ == "__main__":
    render()
