import plotly.express as px
import plotly.graph_objects as go
from typing import List, Dict
import pandas as pd
import numpy as np


def create_enhanced_visualizations(
    responses: List[Dict], question_type: str
) -> List[go.Figure]:
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
        heatmap_data_numeric = heatmap_data.map(lambda x: choice_map[x])

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
