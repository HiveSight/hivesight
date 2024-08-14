# config.py

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

CostPerMillion = namedtuple("CostPerMillion", ['Input', 'Output'])
MODEL_COST_MAP = {
    "GPT-4o-mini": CostPerMillion(0.15, 0.60),
    "GPT-4o": CostPerMillion(5.0, 15.0),
    "GPT-3.5": CostPerMillion(.5, 1.5)
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
