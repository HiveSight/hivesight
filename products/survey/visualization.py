import plotly.graph_objects as go
from typing import Dict, List, Optional
import pandas as pd
from config import LIKERT_LABELS, LIKERT_COLORS


def create_enhanced_visualizations(
    response_counts: pd.DataFrame,
    pivot: Optional[pd.DataFrame],
    groupby_var: Optional[str],
) -> List[go.Figure]:
    figures = []

    # Distribution of scores as horizontal stacked bar chart
    fig1 = go.Figure()
    for label in LIKERT_LABELS:
        count = response_counts.loc[
            response_counts["likert_label"] == label, "percentage"
        ]
        fig1.add_trace(
            go.Bar(
                y=["Distribution of Responses"],
                x=[count.values[0] if not count.empty else 0],
                name=label,
                orientation="h",
                marker=dict(color=LIKERT_COLORS[label]),
                text=[f"{count.values[0]:.1%}" if not count.empty else "0%"],
                textposition="inside",
            )
        )
    fig1.update_layout(
        barmode="stack",
        title="Overall Distribution of Responses",
        xaxis_title="Percentage",
        height=300,
        yaxis=dict(showticklabels=False),
        xaxis=dict(tickformat=".0%", range=[0, 1]),
    )
    figures.append(fig1)

    # Likert scale results by groupby variable (if pivot is provided)
    if pivot is not None and groupby_var is not None:
        fig2 = go.Figure()
        for label in LIKERT_LABELS:
            if label in pivot.columns:
                fig2.add_trace(
                    go.Bar(
                        y=pivot[groupby_var].astype(str),
                        x=pivot[label],
                        name=label,
                        orientation="h",
                        marker=dict(color=LIKERT_COLORS[label]),
                        text=[f"{val:.1%}" for val in pivot[label]],
                        textposition="inside",
                    )
                )

        y_axis_tickformat = "" if groupby_var == "age" else "$,d"

        fig2.update_layout(
            barmode="stack",
            title=f"Likert Scale Results by {groupby_var.capitalize()} Group",
            xaxis_title="Percentage",
            height=400,
            yaxis=dict(
                tickformat=y_axis_tickformat,
                tickprefix="$" if groupby_var == "income" else "",
            ),
            xaxis=dict(tickformat=".0%", range=[0, 1]),
        )
        figures.append(fig2)

    return figures
