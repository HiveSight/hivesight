import streamlit as st
from visualization import create_enhanced_visualizations
from simulation import batch_simulate_responses, analyze_responses
from custom_components import download_button
from config import MODEL_MAP

import pandas as pd


def main():
    st.title("🐝 HiveSight")
    st.write("Ask AIs anything.")

    tab_names = ["Multiple Choice", "Likert Scale"]
    tab_index = st.tabs(tab_names)

    with tab_index[0]:
        st.subheader("Multiple Choice")
        col1, col2 = st.columns(2)
        with col1:
            question_mc = st.text_area(
                "Enter your question", key="question_mc"
            )
        with col2:
            choices_mc = st.text_area(
                "Enter choices (one per line)", key="choices_mc"
            )
            choices_mc = [
                choice.strip()
                for choice in choices_mc.split("\n")
                if choice.strip()
            ]

    with tab_index[1]:
        st.subheader("Likert Scale")
        question_ls = st.text_area(
            "Enter your statement or question", key="question_ls"
        )

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
            list(MODEL_MAP.keys()),
        )
        st.write("Demographic Filters (optional)")
        age_range = st.slider("Age Range", 0, 100, (18, 100))
        income_range = st.slider(
            "Income Range ($)", 0, 1_000_000, (0, 1_000_000)
        )

    if st.button("Run Simulation"):
        # Determine the active tab
        active_tab = "Multiple Choice" if question_mc else "Likert Scale"

        if active_tab == "Multiple Choice" and len(choices_mc) < 2:
            st.error(
                "Please enter at least two choices for multiple choice questions."
            )
            return

        question_type = (
            "likert" if active_tab == "Likert Scale" else "multiple_choice"
        )
        statement = question_ls if question_type == "likert" else question_mc
        choices = None if question_type == "likert" else choices_mc

        with st.spinner("Simulating responses..."):
            responses = batch_simulate_responses(
                statement,
                choices,
                num_queries,
                model_type,
                age_range,
                income_range,
                question_type,
            )

            if not responses:
                st.error(
                    "No valid responses were generated. Please try again or adjust your parameters."
                )
                return

            analysis = analyze_responses(responses, question_type)
            visualizations = create_enhanced_visualizations(
                responses, question_type
            )

        st.success(
            f"Simulation complete. Generated {len(responses)} valid responses."
        )

        st.subheader("Analysis")
        if question_type == "likert":
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
