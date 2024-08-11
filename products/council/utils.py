import re
from config import ANTHROPIC_MODEL
import anthropic

client = anthropic.Anthropic()


def get_advisor_response(question, persona, description, expertise):
    system_prompt = f"""You are the {persona} of an organization. {description or 'Provide advice based on your role.'}
Your areas of expertise are: {', '.join(expertise.keys()) if expertise else 'various areas relevant to your role'}.
Provide your perspective on the given question, considering your role and expertise.
At the end of your response, include:
1. A brief 'Summary' section
2. A 'Key Takeaways' section with 3-5 bullet points
3. A 'Confidence' rating from 1-10 on how confident you are in your advice, given your expertise"""

    message = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=800,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"Please provide your perspective on the following question: {question}",
            }
        ],
    )
    return message.content


def get_summary(question, responses):
    summary_prompt = f"""
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

    message = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": summary_prompt}],
    )

    # Ensure we're returning a string
    return (
        message.content
        if isinstance(message.content, str)
        else str(message.content)
    )


def parse_response(response):
    if not isinstance(response, str):
        response = str(response)

    match = re.search(
        r"TextBlock\(text=[\"'](.*?)[\"']\)", response, re.DOTALL
    )
    content = match.group(1) if match else response

    return (
        re.sub(r",\s*type='text'?\s*$", "", content)
        .replace("\\n", "\n")
        .strip()
    )


def extract_confidence(response):
    match = re.search(r"Confidence:\s*(\d+)", response, re.IGNORECASE)
    return int(match.group(1)) if match else None


def calculate_expertise_relevance(question, expertise):
    return (
        [
            score
            for skill, score in expertise.items()
            if skill.lower() in question.lower()
        ]
        if expertise
        else []
    )


def parse_summary(summary):
    if isinstance(summary, list):
        # If it's a list, join it into a single string
        summary = "\n".join(str(item) for item in summary)
    elif not isinstance(summary, str):
        # If it's neither a list nor a string, convert it to a string
        summary = str(summary)

    lines = summary.split("\n")
    parsed_summary = {}
    current_section = None

    for line in lines:
        line = line.strip()
        if line.startswith("SUMMARY:"):
            current_section = "summary"
            parsed_summary[current_section] = line.split(":", 1)[1].strip()
        elif line.startswith("CONSENSUS_LEVEL:"):
            try:
                parsed_summary["consensus_level"] = int(
                    line.split(":")[1].strip()
                )
            except ValueError:
                parsed_summary["consensus_level"] = (
                    5  # Default value if parsing fails
                )
        elif line.startswith("SENTIMENTS:"):
            current_section = "sentiments"
            parsed_summary[current_section] = {}
        elif line.startswith("KEY_TAKEAWAYS:"):
            current_section = "key_takeaways"
            parsed_summary[current_section] = []
        elif current_section == "sentiments" and ":" in line:
            persona, sentiment = line.split(":", 1)
            parsed_summary[current_section][
                persona.strip()
            ] = sentiment.strip()
        elif current_section == "key_takeaways" and line.startswith("-"):
            parsed_summary[current_section].append(line[1:].strip())

    # Ensure all expected keys are present
    for key in ["summary", "consensus_level", "sentiments", "key_takeaways"]:
        if key not in parsed_summary:
            if key == "consensus_level":
                parsed_summary[key] = 5  # Default consensus level
            elif key in ["sentiments", "key_takeaways"]:
                parsed_summary[key] = (
                    {}
                )  # Empty dict for sentiments, empty list for key_takeaways
            else:
                parsed_summary[key] = (
                    "Not available"  # Default string for summary
                )

    return parsed_summary
