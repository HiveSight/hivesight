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


# Load PolicyEngine microdata (placeholder)
@st.cache_data
def load_policy_engine_data():
    # This is a placeholder. In reality, you'd load your actual PolicyEngine microdata here.
    return pd.read_csv("policy_engine_microdata.csv")


policy_engine_data = load_policy_engine_data()


@lru_cache(maxsize=1000)
def get_persona_from_microdata(age, income, education):
    filtered_data = policy_engine_data[
        (policy_engine_data["age"] >= age[0])
        & (policy_engine_data["age"] <= age[1])
        & (policy_engine_data["income"] >= income[0])
        & (policy_engine_data["income"] <= income[1])
        & (policy_engine_data["education"].isin(education))
    ]
    if filtered_data.empty:
        return None
    sample = filtered_data.sample(n=1).iloc[0]
    return f"{sample['age']}-year-old {sample['gender']} from {sample['state']} with an income of ${sample['income']} and education level of {sample['education']}"


def randomize_choices(choices):
    return random.sample(choices, len(choices))


def parse_numeric_response(response, max_value):
    try:
        score = int(response.strip())
        if 1 <= score <= max_value:
            return score
    except ValueError:
        pass
    return None


def analyze_responses(responses, question_type):
    df = pd.DataFrame(responses)

    if question_type == "likert":
        analysis = {
            "mean": df["score"].mean(),
            "median": df["score"].median(),
            "std_dev": df["score"].std(),
            "count": df["score"].count(),
            "confidence_interval": stats.t.interval(
                alpha=0.95,
                df=len(df) - 1,
                loc=df["score"].mean(),
                scale=stats.sem(df["score"]),
            ),
        }
    else:  # multiple choice
        analysis = df["choice"].value_counts(normalize=True).to_dict()
        analysis["count"] = len(df)

    return analysis


def create_response_visualizations(responses, analysis, question_type):
    df = pd.DataFrame(responses)

    if question_type == "likert":
        # Distribution histogram
        fig1 = px.histogram(
            df,
            x="score",
            nbins=5,
            labels={"score": "Likert Score"},
            title="Distribution of Responses",
        )
        fig1.update_layout(bargap=0.1)
        fig1.update_xaxes(tickvals=list(range(1, 6)))

        # Demographic breakdown
        age_groups = pd.cut(
            df["age"],
            bins=[0, 30, 50, 70, 100],
            labels=["18-30", "31-50", "51-70", "71+"],
        )
        fig2 = px.box(
            df,
            x=age_groups,
            y="score",
            title="Score Distribution by Age Group",
        )

        # Confidence interval plot
        ci_low, ci_high = analysis["confidence_interval"]
        fig3 = go.Figure()
        fig3.add_trace(
            go.Indicator(
                mode="number+gauge",
                value=analysis["mean"],
                domain={"x": [0, 1], "y": [0, 1]},
                title={"text": "Mean Score with 95% CI"},
                gauge={
                    "axis": {"range": [1, 5]},
                    "bar": {"color": "darkblue"},
                    "steps": [
                        {"range": [ci_low, ci_high], "color": "lightgray"}
                    ],
                    "threshold": {
                        "line": {"color": "red", "width": 4},
                        "thickness": 0.75,
                        "value": analysis["mean"],
                    },
                },
            )
        )
    else:  # multiple choice
        # Bar chart of choices
        fig1 = px.bar(
            x=list(analysis.keys())[:-1],
            y=list(analysis.values())[:-1],
            labels={"x": "Choice", "y": "Percentage"},
            title="Distribution of Choices",
        )

        # Demographic breakdown
        age_groups = pd.cut(
            df["age"],
            bins=[0, 30, 50, 70, 100],
            labels=["18-30", "31-50", "51-70", "71+"],
        )
        fig2 = px.histogram(
            df,
            x="choice",
            color=age_groups,
            barmode="group",
            title="Choice Distribution by Age Group",
        )

        fig3 = go.Figure()  # Placeholder for consistency

    return [fig1, fig2, fig3]


def batch_simulate_responses(
    statement,
    choices,
    num_queries,
    model_type,
    age_range,
    income_range,
    education_level,
    question_type,
):
    prompts = []
    personas = []
    for _ in range(num_queries):
        persona = get_persona_from_microdata(
            tuple(age_range), tuple(income_range), tuple(education_level)
        )
        if persona is None:
            continue
        personas.append(persona)
        randomized_choices = randomize_choices(choices) if choices else None

        if question_type == "likert":
            prompt = f"""You are roleplaying as a {persona}. Respond to the following statement based on this persona's likely perspective, beliefs, and experiences. 
            Use a 5-point scale where 1 = Strongly disagree, 2 = Disagree, 3 = Neutral, 4 = Agree, 5 = Strongly agree.
            Statement: "{statement}"
            How much do you agree with the statement?
            Respond with ONLY a number from 1 to 5, no additional explanation."""
        else:  # multiple choice
            prompt = f"""You are roleplaying as a {persona}. Respond to the following question based on this persona's likely perspective, beliefs, and experiences. 
            Question: "{statement}"
            Choose from the following options: {', '.join(randomized_choices)}
            Respond with ONLY the chosen option, no additional explanation."""

        prompts.append(prompt)

    responses = query_openai_batch(prompts, model_type)

    valid_responses = []
    for persona, response in zip(personas, responses):
        if question_type == "likert":
            score = parse_numeric_response(response, 5)
            if score is not None:
                valid_responses.append(
                    {
                        "persona": persona,
                        "score": score,
                        "original_response": response,
                    }
                )
        else:  # multiple choice
            if response.strip() in choices:
                valid_responses.append(
                    {
                        "persona": persona,
                        "choice": response.strip(),
                        "original_response": response,
                    }
                )

    return valid_responses


def main():
    st.set_page_config(page_title="HiveSight", page_icon="🐝", layout="wide")

    st.title("🐝 HiveSight")
    st.write(
        "Simulating diverse perspectives using AI and PolicyEngine microdata"
    )

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
        age_range = st.slider("Age Range", 18, 100, (25, 65))
        income_range = st.slider("Income Range ($)", 0, 500000, (0, 500000))
        education_level = st.multiselect(
            "Education Level", ["High School", "Bachelor's", "Master's", "PhD"]
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
                income_range,
                education_level,
                (
                    "likert"
                    if question_type == "Likert Scale"
                    else "multiple_choice"
                ),
            )
            analysis = analyze_responses(
                responses,
                (
                    "likert"
                    if question_type == "Likert Scale"
                    else "multiple_choice"
                ),
            )
            visualizations = create_response_visualizations(
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
            st.write(
                f"95% Confidence Interval: [{analysis['confidence_interval'][0]:.2f}, {analysis['confidence_interval'][1]:.2f}]"
            )
        else:
            for choice, percentage in analysis.items():
                if choice != "count":
                    st.write(f"{choice}: {percentage:.2%}")
            st.write(f"Total Responses: {analysis['count']}")

        st.subheader("Visualizations")
        for fig in visualizations:
            st.plotly_chart(fig)

        df = pd.DataFrame(responses)
        download_button_str = get_download_button(
            df, "simulated_responses.csv", "Download Simulated Responses"
        )
        st.markdown(download_button_str, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
