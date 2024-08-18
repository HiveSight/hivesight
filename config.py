import os
from collections import namedtuple

import numpy as np


API_KEYS = {
    "OPENAI": os.getenv("OPENAI_API_KEY"),
    "ANTHROPIC": os.getenv("ANTHROPIC_API_KEY"),
}

MODEL_MAP = {
    "GPT-4o-mini": "gpt-4o-mini-2024-07-18",
    "GPT-4o": "gpt-4o-2024-05-13",
    "GPT-3.5": "gpt-3.5-turbo-0125",
}

CostPerMillion = namedtuple("CostPerMillion", ["Input", "Output"])
MODEL_COST_MAP = {
    "GPT-4o-mini": CostPerMillion(0.15, 0.60),
    "GPT-4o": CostPerMillion(5.0, 15.0),
    "GPT-3.5": CostPerMillion(0.5, 1.5),
    "Sonnet": CostPerMillion(3.0, 15.0),
}


AGE_BINS = [0, 18, 25, 35, 45, 55, 65, np.inf]
INCOME_BINS = [0, 30000, 60000, 90000, 120000, np.inf]

LIKERT_LABELS = [
    "Strongly Disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly Agree",
]

LIKERT_COLORS = {
    "Strongly Disagree": "#5A5A5A",  # Dark gray
    "Disagree": "#BFBFBF",  # Light gray
    "Neutral": "#F5F5F5",  # Very light gray
    "Agree": "#FFD700",  # Golden yellow
    "Strongly Agree": "#B8860B",  # Dark goldenrod
}

# Council-specific configurations
DEFAULT_PERSONAS = {
    "CEO": {
        "description": "A visionary leader focused on long-term strategy and organizational growth.",
        "expertise": {
            "Strategy": 9,
            "Leadership": 9,
            "Market Trends": 8,
            "Innovation": 7,
        },
    },
    "CFO": {
        "description": "A financial expert focused on budgeting, cost management, and financial planning.",
        "expertise": {
            "Finance": 9,
            "Budgeting": 9,
            "Risk Management": 8,
            "Investments": 8,
        },
    },
    "COO": {
        "description": "An operations expert focused on improving efficiency and managing day-to-day operations.",
        "expertise": {
            "Operations": 9,
            "Efficiency": 9,
            "Process Management": 8,
            "Supply Chain": 8,
        },
    },
    "CHRO": {
        "description": "A people-oriented executive concerned with talent management and organizational culture.",
        "expertise": {
            "HR": 9,
            "Talent Management": 9,
            "Organizational Culture": 8,
            "Employee Engagement": 8,
        },
    },
}

ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620"
SUMMARY_MAX_TOKENS = 1000

COUNCIL_ADVISOR_SYSTEM_PROMPT_TEMPLATE = """
You are the {persona} of an organization. {description}
Your areas of expertise are: {expertise}.
Provide your perspective on the given question, considering your role and expertise.
A the end of your response, include:
1. A brief 'Summary' section
2. A 'Key Takeaways' section with 3-5 bullet points
3. A 'Confidence' rating from 1-10 on how confident you are in your advice, given your expertise
"""

COUNCIL_ADVISOR_USER_PROMPT_TEMPLATE = (
    "Please provide your perspective on the following question: {question}"
)

COUNCIL_SUMMARY_USER_PROMPT_TEMPLATE = """
    Analyze the following responses from different executives to this question:
    "{question}"

    Responses:
    {responses}

    Provide a comprehensive analysis including:
    1. A concise summary of the key points
    2. Common themes and any disagreements among the executives
    3. Overall consensus level from 1 (strong disagreement) to 10 (strong agreement)
    4. Sentiment analysis for each executive's response (positive, neutral, or negative)
    5. Top 5 key takeaways from all responses combined

    Format your response as follows:
    SUMMARY: [Your summary here]
    CONSENSUS_LEVEL: [Number between 1-10]
    SENTIMENTS:
    [Executive1]: [Sentiment]
    [Executive2]: [Sentiment]
    ...
    KEY_TAKEAWAYS:
    - [Takeaway 1]
    - [Takeaway 2]
    ...
"""
