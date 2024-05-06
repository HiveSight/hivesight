import streamlit as st
from anthropic import Anthropic
import os
from scipy.stats import beta

# Assuming API key and client setup
api_key = os.getenv("ANTHROPIC_API_KEY", st.secrets["ANTHROPIC_API_KEY"])
client = Anthropic(api_key=api_key)


def query_claude(question, model_type):
    model_map = {
        "Haiku": "claude-3-haiku-20240307",
        "Sonnet": "claude-3-sonnet-20240229",
        "Opus": "claude-3-opus-20240229",
    }
    try:
        response = client.messages.create(
            max_tokens=50,
            model=model_map[model_type],
            messages=[
                {
                    "role": "user",
                    "content": f"{question} Do not reply with anything other than 'yes' or 'no'.",
                }
            ],
        )
        if (
            response.content
            and isinstance(response.content, list)
            and hasattr(response.content[0], "text")
        ):
            return response.content[0].text.strip().lower().rstrip(".")
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


def is_valid_response(response):
    return response in ["yes", "no"]


def main():
    st.title("HiveSight")
    st.write(
        "Ask Claude a binary question multiple times and see the percentage of 'yes' responses."
    )

    model_type = st.selectbox("Choose Model Type", ("Haiku", "Sonnet", "Opus"))
    question = st.text_area("Enter your binary question")
    num_queries = st.number_input(
        "Number of Queries", min_value=1, max_value=100, value=10, step=1
    )

    if st.button("Ask Claude"):
        yes_count = 0
        no_count = 0
        valid_responses = 0
        for _ in range(num_queries):
            response_text = query_claude(question, model_type)
            print(response_text)
            if is_valid_response(response_text):
                if response_text == "yes":
                    yes_count += 1
                else:
                    no_count += 1
                valid_responses += 1

        if valid_responses > 0:
            yes_percentage = yes_count / valid_responses * 100
            no_percentage = no_count / valid_responses * 100

            # Calculate the 95% confidence interval for the 'yes' probability
            ci_low, ci_high = beta.interval(0.95, yes_count + 1, no_count + 1)
            ci_low *= 100
            ci_high *= 100

            st.success(
                f"Claude responded 'yes' {yes_percentage:.2f}% of the time and 'no' {no_percentage:.2f}% of the time."
            )
            st.info(
                f"95% Confidence Interval for 'yes' probability: [{ci_low:.2f}%, {ci_high:.2f}%]"
            )
        else:
            st.error("No valid responses received from Claude.")


if __name__ == "__main__":
    main()
