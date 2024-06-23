import plotly.express as px
import plotly.graph_objects as go
from typing import List, Dict
import pandas as pd
import numpy as np
from config import AGE_BINS, INCOME_BINS


def generate_labels(bins):
    labels = []
    for i in range(len(bins) - 1):
        if bins[i + 1] == np.inf:
            labels.append(f"{bins[i]}+")
        else:
            labels.append(f"{bins[i]}-{bins[i + 1] - 1}")
    return labels


def create_enhanced_visualizations(
    responses: List[Dict], question_type: str
) -> List[go.Figure]:
    df = pd.DataFrame(responses)

    # Generate labels from bins
    age_labels = generate_labels(AGE_BINS)
    income_labels = generate_labels(INCOME_BINS)

    if question_type == "likert":
        # Likert scale mapping
        likert_labels = [
            "Strongly Disagree",
            "Disagree",
            "Neutral",
            "Agree",
            "Strongly Agree",
        ]
        likert_mapping = {i + 1: likert_labels[i] for i in range(5)}
        df["likert_label"] = df["score"].map(likert_mapping)

        # Ensure all Likert options are plotted, even if zero
        complete_likert_df = pd.DataFrame(
            likert_labels, columns=["likert_label"]
        )
        response_counts = df["likert_label"].value_counts().reset_index()
        response_counts.columns = ["likert_label", "count"]
        complete_response_counts = complete_likert_df.merge(
            response_counts, on="likert_label", how="left"
        ).fillna(0)
        complete_response_counts["count"] = complete_response_counts[
            "count"
        ].astype(int)

        # Distribution of scores
        fig1 = px.bar(
            complete_response_counts,
            x="likert_label",
            y="count",
            category_orders={"likert_label": likert_labels},
            labels={"likert_label": "Likert Score", "count": "Count"},
            title="Distribution of Responses",
        )
        fig1.update_layout(bargap=0.1)

        # Score distribution by age group
        fig2 = px.box(
            df.sort_values("age"),
            x=pd.cut(
                df["age"],
                bins=AGE_BINS,
                labels=age_labels,
            ),
            y="likert_label",
            title="Score Distribution by Age Group",
            category_orders={"likert_label": likert_labels},
        )

        # Score distribution by income group
        fig3 = px.box(
            df,
            x=pd.cut(
                df["income"],
                bins=INCOME_BINS,
                labels=income_labels,
            ),
            y="likert_label",
            title="Score Distribution by Income Group",
            category_orders={"likert_label": likert_labels},
        )

        # Heatmap of average score by age and income groups
        age_income_pivot = df.pivot_table(
            values="score",
            index=pd.cut(
                df["age"],
                bins=AGE_BINS,
                labels=age_labels,
            ),
            columns=pd.cut(
                df["income"],
                bins=INCOME_BINS,
                labels=income_labels,
            ),
            aggfunc="mean",
        ).round(1)
        age_income_pivot = age_income_pivot.applymap(
            lambda x: likert_labels[int(x) - 1] if not pd.isnull(x) else x
        )
        fig4 = px.imshow(
            age_income_pivot, title="Average Score by Age and Income Groups"
        )
    else:  # multiple choice
        # Distribution of choices
        choice_counts = df["choice"].value_counts(normalize=True).reset_index()
        choice_counts.columns = ["Choice", "Percentage"]
        choice_counts["Percentage"] *= 100
        fig1 = px.bar(
            choice_counts.sort_values("Percentage"),
            y="Choice",
            x="Percentage",
            title="Distribution of Choices",
            orientation="h",
            labels={"Percentage": "Percentage of Total"},
        )
        fig1.update_layout(xaxis_title="Percentage of Total")

        # Choice distribution by age group
        fig2 = px.histogram(
            df,
            x=pd.cut(
                df["age"],
                bins=AGE_BINS,
                labels=age_labels,
            ),
            color="choice",
            title="Choice Distribution by Age Group",
            barmode="group",
            labels={"x": "Age Group", "choice": "Choice"},
        )
        fig2.update_layout(xaxis_title="Age Group")

        # Choice distribution by income group
        fig3 = px.histogram(
            df,
            x=pd.cut(
                df["income"],
                bins=INCOME_BINS,
                labels=income_labels,
            ),
            color="choice",
            title="Choice Distribution by Income Group",
            barmode="group",
            labels={"x": "Income Group", "choice": "Choice"},
        )
        fig3.update_layout(xaxis_title="Income Group")

        # Heatmap of choice distribution by age and income groups
        df["age_group"] = pd.cut(
            df["age"], bins=AGE_BINS, labels=age_labels, include_lowest=True
        )
        df["income_group"] = pd.cut(
            df["income"],
            bins=INCOME_BINS,
            labels=income_labels,
            include_lowest=True,
        )

        # Create a complete matrix with all combinations
        heatmap_data = pd.DataFrame(index=age_labels, columns=income_labels)

        # Fill the matrix with proportions
        for age_group in age_labels:
            for income_group in income_labels:
                group_data = df[
                    (df["age_group"] == age_group)
                    & (df["income_group"] == income_group)
                ]
                if len(group_data) > 0:
                    most_common = group_data["choice"].mode().iloc[0]
                    heatmap_data.loc[age_group, income_group] = most_common
                else:
                    heatmap_data.loc[age_group, income_group] = "No data"

        # Create a numerical mapping for choices
        unique_choices = df["choice"].unique()
        choice_map = {choice: i for i, choice in enumerate(unique_choices)}
        choice_map["No data"] = -1

        # Convert choices to numbers
        heatmap_data_numeric = heatmap_data.map(lambda x: choice_map[x])

        fig4 = px.imshow(
            heatmap_data_numeric,
            labels=dict(x="Income Group", y="Age Group", color="Choice"),
            x=income_labels,
            y=age_labels,
            title="Most Common Choice by Age and Income Groups",
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
