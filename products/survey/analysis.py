import pandas as pd
from config import LIKERT_LABELS, AGE_BINS, INCOME_BINS
import numpy as np
import locale

# Set locale for number formatting
locale.setlocale(locale.LC_ALL, "")


def analyze_responses(df: pd.DataFrame) -> pd.DataFrame:
    # Likert scale mapping
    likert_mapping = {i + 1: LIKERT_LABELS[i] for i in range(5)}
    df["likert_label"] = df["score"].map(likert_mapping)

    # Calculate the percentage of total responses for each Likert label
    response_counts = (
        df["likert_label"].value_counts(normalize=True).reset_index()
    )
    response_counts.columns = ["likert_label", "percentage"]

    return response_counts


def create_pivot_table(df: pd.DataFrame, groupby_var: str) -> pd.DataFrame:
    if groupby_var == "age":
        bins = AGE_BINS
    elif groupby_var == "income":
        bins = INCOME_BINS
    else:
        raise ValueError(
            "Unsupported groupby variable. Supported variables are 'age' and 'income'."
        )

    labels = generate_labels(bins, groupby_var)

    # Create likert_label column if it doesn't exist
    if "likert_label" not in df.columns:
        likert_mapping = {i + 1: LIKERT_LABELS[i] for i in range(5)}
        df["likert_label"] = df["score"].map(likert_mapping)

    pivot = df.pivot_table(
        values="score",
        index=pd.cut(df[groupby_var], bins=bins, labels=labels),
        columns="likert_label",
        aggfunc="count",
        fill_value=0,
        observed=False,
    )

    # Ensure all Likert labels are present
    for label in LIKERT_LABELS:
        if label not in pivot.columns:
            pivot[label] = 0

    # Normalize the pivot table
    pivot = pivot.div(pivot.sum(axis=1), axis=0)

    return pivot.reset_index()


def generate_labels(bins, groupby_var):
    labels = []
    for i in range(len(bins) - 1):
        if bins[i + 1] == np.inf:
            if groupby_var == "income":
                labels.append(
                    f"{locale.format_string('%d', bins[i], grouping=True)}+"
                )
            else:
                labels.append(f"{bins[i]}+")
        else:
            if groupby_var == "income":
                start = locale.format_string("%d", bins[i], grouping=True)
                end = locale.format_string(
                    "%d", bins[i + 1] - 1, grouping=True
                )
                labels.append(f"{start}-{end}")
            else:
                labels.append(f"{bins[i]}-{bins[i+1] - 1}")
    return labels
