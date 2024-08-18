from typing import List, Dict, Callable
import streamlit as st
from utils.openai_utils import run_batch_query


def parse_numeric_response(response, max_value):
    try:
        score = int(response.strip())
        if 1 <= score <= max_value:
            return score
    except ValueError:
        pass
    return None


def batch_simulate_responses(
    statement: str,
    choices: List[str],
    num_queries: int,
    model_type: str,
    personas: List[str],
    prompts: List[str],
    question_type: str,
    progress_callback: Callable[[float], None] = None,
) -> List[Dict]:

    # Run all prompts in a single batch
    all_responses = run_batch_query(prompts, model_type, max_tokens=1)

    if progress_callback:
        progress_callback(1.0)  # Set progress to 100% after batch completion

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
                        "persona": f"{persona['age']}-year-old from {persona['state']} with annual income of ${persona['income']}",
                        "age": persona["age"],
                        "income": persona["income"],
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
                            "persona": f"{persona['age']}-year-old from {persona['state']} with annual income of ${persona['income']}",
                            "age": persona["age"],
                            "income": persona["income"],
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
