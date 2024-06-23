import os
import datetime
import json
import random
from functools import lru_cache

import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from custom_components import download_button
from gpt import query_openai_batch
from scipy import stats


# Load perspectives data
@st.cache_data
def load_perspectives_data():
    return pd.read_csv("perspectives.csv")


perspectives_data = load_perspectives_data()


def select_diverse_personas(num_queries, age_range, wages_range):
    filtered_data = perspectives_data[
        (perspectives_data["age"] >= age_range[0])
        & (perspectives_data["age"] <= age_range[1])
        & (perspectives_data["wages"] >= wages_range[0])
        & (perspectives_data["wages"] <= wages_range[1])
    ]
    return filtered_data.sample(
        n=min(num_queries, len(filtered_data)), weights="weight"
    ).to_dict("records")


def create_prompt(persona, statement, question_type, choices=None):
    if question_type == "likert":
        return f"""You are roleplaying as a {persona['age']}-year-old from {persona['state']} with an annual wage of ${persona['wages']}. 
        Respond to the following statement based on this persona's likely perspective, beliefs, and experiences. 
        Use a 5-point scale where 1 = Strongly disagree, 2 = Disagree, 3 = Neutral, 4 = Agree, 5 = Strongly agree.
        Statement: "{statement}"
        How much do you agree with the statement?
        Respond with ONLY a single number from 1 to 5, no additional explanation."""
    else:  # multiple choice
        if choices is None:
            raise ValueError(
                "Choices must be provided for multiple choice questions."
            )
        numbered_choices = "\n".join(
            f"{i+1}. {choice}" for i, choice in enumerate(choices)
        )
        return f"""You are roleplaying as a {persona['age']}-year-old from {persona['state']} with an annual wage of ${persona['wages']}. 
        Respond to the following question based on this persona's likely perspective, beliefs, and experiences. 
        Question: "{statement}"
        Choose from the following options:
        {numbered_choices}
        Respond with ONLY the single number of your chosen option (1, 2, 3, etc.), nothing else. Do not include the choice text or any explanation."""


def parse_numeric_response(response, max_value):
    try:
        score = int(response.strip())
        if 1 <= score <= max_value:
            return score
    except ValueError:
        pass
    return None


def analyze_responses(responses, question_type):
    if not responses:
        return {"count": 0}

    df = pd.DataFrame(responses)

    if question_type == "likert":
        analysis = {
            "mean": df["score"].mean(),
            "median": df["score"].median(),
            "std_dev": df["score"].std(),
            "count": df["score"].count(),
        }

        # Calculate confidence interval
        try:
            n = len(df)
            sem = stats.sem(df["score"])
            ci = stats.t.interval(
                confidence=0.95, df=n - 1, loc=analysis["mean"], scale=sem
            )
            analysis["confidence_interval"] = ci
        except Exception as e:
            st.warning(f"Error calculating confidence interval: {str(e)}")
            analysis["confidence_interval"] = (None, None)

    else:  # multiple choice
        if "choice" not in df.columns:
            return {"count": 0, "error": "No valid choices found in responses"}
        analysis = df["choice"].value_counts(normalize=True).to_dict()
        analysis["count"] = len(df)

    return analysis


def batch_simulate_responses(
    statement,
    choices,
    num_queries,
    model_type,
    age_range,
    wages_range,
    question_type,
):
    personas = select_diverse_personas(num_queries, age_range, wages_range)
    prompts = [
        create_prompt(persona, statement, question_type, choices)
        for persona in personas
    ]

    # Split prompts into batches of 20 (or adjust based on API limits)
    batch_size = 20
    batched_prompts = [
        prompts[i : i + batch_size] for i in range(0, len(prompts), batch_size)
    ]

    all_responses = []
    for batch in batched_prompts:
        responses = query_openai_batch(
            batch, model_type, max_tokens=1
        )  # Limit to 1 token
        all_responses.extend(responses)

    valid_responses = []
    for persona, response in zip(personas, all_responses):
        if response.startswith("Error"):
            st.warning(f"API Error: {response}")
            continue
        if question_type == "likert":
            score = parse_numeric_response(response, 5)
            if score is not None:
                valid_responses.append(
                    {
                        "persona": f"{persona['age']}-year-old from {persona['state']} with a wage of ${persona['wages']}",
                        "age": persona["age"],
                        "wages": persona["wages"],
                        "state": persona["state"],
                        "score": score,
                        "original_response": response,
                    }
                )
        else:  # multiple choice
            try:
                choice_index = int(response.strip()) - 1
                if 0 <= choice_index < len(choices):
                    valid_responses.append(
                        {
                            "persona": f"{persona['age']}-year-old from {persona['state']} with a wage of ${persona['wages']}",
                            "age": persona["age"],
                            "wages": persona["wages"],
                            "state": persona["state"],
                            "choice": choices[choice_index],
                            "original_response": response,
                        }
                    )
                else:
                    st.warning(f"Invalid choice index: {response}")
            except ValueError:
                st.warning(f"Invalid response for multiple choice: {response}")

    return valid_responses


def create_enhanced_visualizations(responses, analysis, question_type):
    df = pd.DataFrame(responses)

    if question_type == "likert":
        # Distribution of scores
        fig1 = px.histogram(
            df,
            x="score",
            nbins=5,
            labels={"score": "Likert Score"},
            title="Distribution of Responses",
        )
        fig1.update_layout(bargap=0.1)
        fig1.update_xaxes(tickvals=list(range(1, 6)))

        # Score distribution by age group
        fig2 = px.box(
            df,
            x=pd.cut(
                df["age"],
                bins=[0, 30, 50, 70, 100],
                labels=["0-30", "31-50", "51-70", "71+"],
            ),
            y="score",
            title="Score Distribution by Age Group",
        )

        # Score distribution by wage group
        fig3 = px.box(
            df,
            x=pd.cut(
                df["wages"],
                bins=[0, 30000, 60000, 100000, np.inf],
                labels=["0-30k", "30k-60k", "60k-100k", "100k+"],
            ),
            y="score",
            title="Score Distribution by Wage Group",
        )

        # Heatmap of average score by age and wage groups
        age_wage_pivot = df.pivot_table(
            values="score",
            index=pd.cut(
                df["age"],
                bins=[0, 30, 50, 70, 100],
                labels=["0-30", "31-50", "51-70", "71+"],
            ),
            columns=pd.cut(
                df["wages"],
                bins=[0, 30000, 60000, 100000, np.inf],
                labels=["0-30k", "30k-60k", "60k-100k", "100k+"],
            ),
            aggfunc="mean",
        )
        fig4 = px.imshow(
            age_wage_pivot, title="Average Score by Age and Wage Groups"
        )
    else:  # multiple choice
        # Distribution of choices
        choice_counts = df["choice"].value_counts().reset_index()
        choice_counts.columns = ["Choice", "Count"]
        fig1 = px.bar(
            choice_counts,
            x="Choice",
            y="Count",
            title="Distribution of Choices",
        )

        # Choice distribution by age group
        fig2 = px.histogram(
            df,
            x="choice",
            color=pd.cut(
                df["age"],
                bins=[0, 30, 50, 70, 100],
                labels=["0-30", "31-50", "51-70", "71+"],
            ),
            title="Choice Distribution by Age Group",
            barmode="group",
        )

        # Choice distribution by wage group
        fig3 = px.histogram(
            df,
            x="choice",
            color=pd.cut(
                df["wages"],
                bins=[0, 30000, 60000, 100000, np.inf],
                labels=["0-30k", "30k-60k", "60k-100k", "100k+"],
            ),
            title="Choice Distribution by Wage Group",
            barmode="group",
        )

        # Heatmap of choice distribution by age and wage groups
        age_bins = [0, 30, 50, 70, 100]
        wage_bins = [0, 30000, 60000, 100000, np.inf]
        age_labels = ["0-30", "31-50", "51-70", "71+"]
        wage_labels = ["0-30k", "30k-60k", "60k-100k", "100k+"]

        df["age_group"] = pd.cut(
            df["age"], bins=age_bins, labels=age_labels, include_lowest=True
        )
        df["wage_group"] = pd.cut(
            df["wages"],
            bins=wage_bins,
            labels=wage_labels,
            include_lowest=True,
        )

        # Create a complete matrix with all combinations
        heatmap_data = pd.DataFrame(index=age_labels, columns=wage_labels)

        # Fill the matrix with proportions
        for age_group in age_labels:
            for wage_group in wage_labels:
                group_data = df[
                    (df["age_group"] == age_group)
                    & (df["wage_group"] == wage_group)
                ]
                if len(group_data) > 0:
                    most_common = group_data["choice"].mode().iloc[0]
                    heatmap_data.loc[age_group, wage_group] = most_common
                else:
                    heatmap_data.loc[age_group, wage_group] = "No data"

        # Create a numerical mapping for choices
        unique_choices = df["choice"].unique()
        choice_map = {choice: i for i, choice in enumerate(unique_choices)}
        choice_map["No data"] = -1

        # Convert choices to numbers
        heatmap_data_numeric = heatmap_data.applymap(lambda x: choice_map[x])

        fig4 = px.imshow(
            heatmap_data_numeric,
            labels=dict(x="Wage Group", y="Age Group", color="Choice"),
            x=wage_labels,
            y=age_labels,
            title="Most Common Choice by Age and Wage Groups",
            aspect="auto",
            color_continuous_scale="Viridis",
            text_auto=True,
        )
        fig4.update_traces(text=heatmap_data.values, texttemplate="%{text}")
        fig4.update_xaxes(side="top")

        # Add a color bar with choice labels
        tickvals = list(choice_map.values())[:-1]  # Exclude 'No data'
        ticktext = list(choice_map.keys())[:-1]  # Exclude 'No data'
        fig4.update_layout(
            coloraxis_colorbar=dict(
                tickvals=tickvals,
                ticktext=ticktext,
            )
        )

    return [fig1, fig2, fig3, fig4]


def main():
    st.title("🐝 HiveSight")
    st.write("Simulating diverse perspectives using AI and perspectives data")

    col1, col2 = st.columns(2)

    with col1:
        question_type = st.radio(
            "Question Type", ["Multiple Choice", "Likert Scale"]
        )
        statement = st.text_area("Enter your question or statement")

        if question_type == "Multiple Choice":
            choices = st.text_area("Enter choices (one per line)")
            choices = [
                choice.strip()
                for choice in choices.split("\n")
                if choice.strip()
            ]
        else:
            choices = None

        num_queries = st.number_input(
            "Number of Simulated Responses",
            min_value=1,
            max_value=1000,
            value=100,
            step=1,
        )
        model_type = st.selectbox(
            "Choose Model Type", ("GPT-3.5", "GPT-4", "Claude-3")
        )

    with col2:
        st.write("Demographic Filters (optional)")
        age_range = st.slider("Age Range", 0, 100, (25, 65))
        wages_range = st.slider("Wages Range ($)", 0, 500000, (0, 100000))

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
                analysis,
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
