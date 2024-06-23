import streamlit as st
from visualization import create_enhanced_visualizations
from simulation import batch_simulate_responses, analyze_responses
from custom_components import download_button
from config import MODEL_MAP

import pandas as pd


def main():
    st.title("🐝 HiveSight")
    st.write("Ask AIs anything.")

    question_type = st.radio(
        "Question Type", ["Multiple Choice", "Likert Scale"]
    )
    statement = st.text_area("Enter your question or statement")

    if question_type == "Multiple Choice":
        choices = st.text_area("Enter choices (one per line)")
        choices = [
            choice.strip() for choice in choices.split("\n") if choice.strip()
        ]
    else:
        choices = None

    num_queries = st.number_input(
        "Number of Simulated Responses",
        min_value=1,
        max_value=1000,
        value=10,
        step=1,
    )

    with st.expander("Additional Options", expanded=False):
        model_type = st.selectbox(
            "Choose Model Type",
            MODEL_MAP.keys(),
        )
        st.write("Demographic Filters (optional)")
        age_range = st.slider("Age Range", 0, 100, (18, 100))
        wages_range = st.slider(
            "Income Range ($)", 0, 1_000_000, (0, 1_000_000)
        )

    if st.button("Run Simulation"):
        if question_type == "Multiple Choice" and len(choices) < 2:
            st.error(
                "Please enter at least two choices for multiple choice questions."
            )
            return

        with st.spinner("Simulating responses..."):
            responses = batch_simulate_responses(
                statement,
                choices,
                num_queries,
                model_type,
                age_range,
                wages_range,
                (
                    "likert"
                    if question_type == "Likert Scale"
                    else "multiple_choice"
                ),
            )

            if not responses:
                st.error(
                    "No valid responses were generated. Please try again or adjust your parameters."
                )
                return

            analysis = analyze_responses(
                responses,
                (
                    "likert"
                    if question_type == "Likert Scale"
                    else "multiple_choice"
                ),
            )
            visualizations = create_enhanced_visualizations(
                responses,
                (
                    "likert"
                    if question_type == "Likert Scale"
                    else "multiple_choice"
                ),
            )

        st.success(
            f"Simulation complete. Generated {len(responses)} valid responses."
        )

        st.subheader("Analysis")
        if question_type == "Likert Scale":
            st.write(f"Mean Score: {analysis['mean']:.2f}")
            st.write(f"Median Score: {analysis['median']:.2f}")
            st.write(f"Standard Deviation: {analysis['std_dev']:.2f}")
            st.write(f"Total Responses: {analysis['count']}")

            ci_low, ci_high = analysis.get("confidence_interval", (None, None))
            if ci_low is not None and ci_high is not None:
                st.write(
                    f"95% Confidence Interval: [{ci_low:.2f}, {ci_high:.2f}]"
                )
            else:
                st.write("95% Confidence Interval: Not available")
        else:
            for choice, percentage in analysis.items():
                if choice != "count":
                    st.write(f"{choice}: {percentage:.2%}")
            st.write(f"Total Responses: {analysis['count']}")

        st.subheader("Visualizations")
        for fig in visualizations:
            st.plotly_chart(fig)

        df = pd.DataFrame(responses)
        download_button_str = download_button(
            df, "simulated_responses.csv", "Download Simulated Responses"
        )
        st.markdown(download_button_str, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
