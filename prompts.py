from typing import Dict, List, Optional


def create_prompt(
    persona: Dict,
    statement: str,
    question_type: str,
    choices: Optional[List[str]] = None,
) -> str:
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
