import streamlit as st
from anthropic import Anthropic, AsyncAnthropic, NOT_GIVEN
import os
from scipy.stats import beta
import time
import pandas as pd
from custom_components import download_button
import asyncio
from openai import OpenAI, AsyncOpenAI, NOT_GIVEN as OPENAI_NOT_GIVEN
import json

# Global variables ----------- 
anthropic_api_key = os.getenv(
    "ANTHROPIC_API_KEY", st.secrets["ANTHROPIC_API_KEY"]
)
openai_api_key = os.getenv("OPENAI_API_KEY", st.secrets["OPENAI_API_KEY"])

anthropic_client = Anthropic(api_key=anthropic_api_key)
anthropic_client_async = AsyncAnthropic(api_key=anthropic_api_key)

openai_client = OpenAI()
openai_client_async = AsyncOpenAI()


SYSTEM_PROMPT = """
You are trying to help a person answer a 'yes' or 'no' question. You will listen to
what the user says and attempt to interpret the communication as a yes or no question.
If you see the instructions to 'Please provide an explanation.' at the end
of the user's prompt, then start your answer with 'yes,' and then provide the explanation. If
you do not see instructions to provide an explanation, then do not replay with anything
other than 'yes' or 'no' (omit the quotations in the reply)
"""

EXPLANATION_APPEND = " Please provide an explanation."

# Functions ----------------

def query_openai(
    question, model_type, request_explanation, num_queries,
    temperature=1.0, top_p=None
):
    model_map = {
        "GPT-3.5": "gpt-3.5-turbo-0125",
        "GPT-4o": "gpt-4o",
    }
    top_p_input = OPENAI_NOT_GIVEN if top_p is None else top_p
    try:
        user_prompt = question
        if request_explanation:
            user_prompt = f"{user_prompt} {EXPLANATION_APPEND}"
        response = openai_client.chat.completions.create(
            model=model_map[model_type],
            temperature=temperature,
            top_p=top_p_input,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=500,
            n=num_queries
        )

        if response.choices[0].message.content:
            return [r.message.content.strip() for r in response.choices]
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


def query_openai_batch(question, model_type, request_explanation, num_queries,
                       temperature=1.0, top_p=None, status_box=None
):
    model_map = {
        "GPT-3.5": "gpt-3.5-turbo-0125",
        "GPT-4o": "gpt-4o",
    }
    user_prompt = question
    if request_explanation:
        user_prompt = f"{user_prompt} {EXPLANATION_APPEND}"

    single_input = {
        "custom_id": "request-1",
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": {
            "model": model_map[model_type],
            "temperature": temperature,
            "top_p": top_p,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "n": num_queries,
            "max_tokens": 500,
        },
    }
    batch_input = [single_input]

    print("Batch input:")
    print(batch_input)

    # Save the batch input to a file
    with open("batch_input.jsonl", "w") as f:
        for item in batch_input:
            f.write(json.dumps(item) + "\n")

    print("Batch input file saved.")

    # Upload the batch input file
    try:
        batch_input_file = openai_client.files.create(
            file=open("batch_input.jsonl", "rb"), purpose="batch"
        )
        print("Batch input file uploaded successfully.")
        print("Batch input file ID:", batch_input_file.id)
    except Exception as e:
        print("Error uploading batch input file:", e)
        return None

    # Create the batch
    try:
        batch = openai_client.batches.create(
            input_file_id=batch_input_file.id,
            endpoint="/v1/chat/completions",
            completion_window="24h",
        )
        print("Batch created successfully.")
        print("Batch ID:", batch.id)
    except Exception as e:
        print("Error creating batch:", e)
        return None

    while True:
        try:
            batch_status = openai_client.batches.retrieve(batch.id)
            status = batch_status.status
            print("Batch status:", status)
            if status_box:
                status_box.text(f"Batch status is {status}")
            if status in ["completed", "failed", "expired", "cancelled"]:
                break
            time.sleep(5)  # Wait for 5 seconds before checking again
        except Exception as e:
            print("Error retrieving batch status:", e)
            return None

    if status == "completed":
        try:
            content = (
                openai_client.files.content(batch_status.output_file_id)
                .read()
                .decode("utf-8")
            )
            print("Batch results retrieved successfully.")
            results = [json.loads(line) for line in content.strip().split("\n")]
            return [c['message']['content'] for c in results[0]['response']['body']['choices']]
        except Exception as e:
            print("Error retrieving batch results:", e)
            return None
    else:
        error_message = f"Batch processing failed with status: {status}"
        print(error_message)
        return None


def query_claude(question, model_type, request_explanation, temperature=1.0, 
                 top_p=None, top_k=None):
    model_map = {
        "Haiku": "claude-3-haiku-20240307",
        "Sonnet": "claude-3-sonnet-20240229",
        "Opus": "claude-3-opus-20240229"
    }
    top_k_input = NOT_GIVEN if top_k is None else top_k
    top_p_input = NOT_GIVEN if top_p is None else top_p
    try:
        user_prompt = question
        if request_explanation:
            user_prompt = f"{user_prompt} {EXPLANATION_APPEND}"

        response = anthropic_client.messages.create(
            max_tokens=500,
            model=model_map[model_type],
            temperature=temperature,
            top_k=top_k_input,
            top_p=top_p_input,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        if (
            response.content
            and isinstance(response.content, list)
            and hasattr(response.content[0], "text")
        ):
            return response.content[0].text.strip()
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


async def query_claude_async(
    question, model_type, request_explanation, num_queries,
    temperature=1.0, top_p=None, top_k=None
):
    model_map = {
        "Haiku": "claude-3-haiku-20240307",
        "Sonnet": "claude-3-sonnet-20240229",
        "Opus": "claude-3-opus-20240229",
    }
    top_k_input = NOT_GIVEN if top_k is None else top_k
    top_p_input = NOT_GIVEN if top_p is None else top_p
    try:
        user_prompt = question
        if request_explanation:
            user_prompt = f"{user_prompt} {EXPLANATION_APPEND}"

        async def send_message_async():
            response = await anthropic_client_async.messages.create(
                max_tokens=500,
                model=model_map[model_type],
                temperature=temperature,
                top_k=top_k_input,
                top_p=top_p_input,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return response

        response = await asyncio.gather(
            *[send_message_async() for _ in range(num_queries)]
        )
        if (
            response[0].content
            and isinstance(response[0].content, list)
            and hasattr(response[0].content[0], "text")
        ):
            return [r.content[0].text.strip() for r in response]
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


def is_valid_response(response, request_explanation):
    response = response.strip("'\"")
    if request_explanation:
        return response.lower().startswith(
            "yes"
        ) or response.lower().startswith("no")
    else:
        return response.lower() in ["yes", "no"]


def summarize_explanations(explanations):
    summary_prompt = (
        "Please provide a concise summary of the main points from the following explanations:\n\n"
        + "\n".join(explanations)
    )
    response = anthropic_client.messages.create(
        max_tokens=200,
        model="claude-3-opus-20240229",
        messages=[{"role": "user", "content": summary_prompt}],
    )
    if (
        response.content
        and isinstance(response.content, list)
        and hasattr(response.content[0], "text")
    ):
        return response.content[0].text.strip()
    else:
        return "Error summarizing explanations"


@st.cache_data
def convert_df(df):
    return df.to_csv(index=False).encode("utf-8")


def get_download_button(df, filename, button_text):
    csv = convert_df(df)
    return download_button(csv, filename, button_text)


def main():
    st.title("HiveSight")
    st.write(
        "Ask Claude a binary question multiple times and see the percentage of 'yes' responses."
    )

    model_type = st.selectbox(
        "Choose Model Type", ("Haiku", "Sonnet", "Opus", "GPT-3.5", "GPT-4o")
    )
    question = st.text_area("Enter your binary question")
    num_queries = st.number_input(
        "Number of Queries", min_value=1, max_value=100, value=10, step=1
    )
    request_explanation = st.checkbox("Request Explanation")
    status_text = st.empty()

    temperature = st.number_input(
        label="Temperature",
        value=1.0,
        min_value=0.0,
        max_value=2.0,
        step=.01
    )

    use_top_p = st.checkbox("Use Top p")
    top_p = None
    if use_top_p:
        top_p = st.number_input(
            label="Top p",
            value=1.0,
            min_value=0.01,
            max_value=1.0,
            step=.01
        )

    use_aync = False
    if model_type in ("Haiku", "Sonnet", "Opus"):
        use_top_k = st.checkbox("Use Top k")
        top_k = None
        if use_top_k:
            top_k = st.number_input(
                label="Top k",
                value=50,
                min_value=1,
                max_value=2000,
                step=1
            )
        use_async = st.checkbox("Use Async")

    use_batch = False
    if model_type in ("GPT-3.5", "GPT-4o"):
        use_batch = st.checkbox("Use Batch")

    if st.button("Run LLM Multiple Times"):

        if model_type in ["Haiku", "Sonnet", "Opus"]:
            if not use_async:  # Anthropic sequential
                progress_bar = st.empty()

                yes_count = 0
                no_count = 0
                valid_responses = 0
                raw_responses = []
                explanations = []

                for i in range(num_queries):
                    response_text = query_claude(
                        question, model_type, request_explanation,
                        temperature=temperature, top_p=top_p, top_k=top_k
                    )
                    raw_responses.append(response_text)
                    if is_valid_response(response_text, request_explanation):
                        if response_text.lower().startswith("yes"):
                            yes_count += 1
                        else:
                            no_count += 1
                        valid_responses += 1
                        if request_explanation:
                            explanations.append(response_text)

                    progress = (i + 1) / num_queries
                    progress_bar.progress(progress)
                    status_text.text(f"Processing query {i+1} of {num_queries}")
                    time.sleep(0.1)  # Add a small delay for better visual effect
                
                progress_bar.empty()
            else:  # Claude async processing
                raw_responses = asyncio.run(
                    query_claude_async(
                        question, model_type, request_explanation, num_queries,
                        temperature=temperature, top_p=top_p, top_k=top_k
                    )
                )
                valid_responses = [
                    is_valid_response(r_text, request_explanation)
                    for r_text in raw_responses
                ]
                yes_responses = [
                    r_text.lower().startswith("yes") and is_valid
                    for r_text, is_valid in zip(raw_responses, valid_responses)
                ]
                no_responses = [
                    r_text.lower().startswith("no") and is_valid
                    for r_text, is_valid in zip(raw_responses, valid_responses)
                ]

                valid_responses = sum(valid_responses)
                yes_count = sum(yes_responses)
                no_count = sum(no_responses)
                explanations = raw_responses if request_explanation else []

        elif model_type in ["GPT-3.5", "GPT-4o"]:

            if use_batch:
                raw_responses = query_openai_batch(
                    question, model_type, request_explanation, num_queries,
                       temperature, top_p=top_p, status_box=status_text)

            else:
                raw_responses = query_openai(
                    question, model_type, request_explanation, num_queries,
                    temperature, top_p=top_p
                )

            valid_responses = [
                is_valid_response(r_text, request_explanation)
                for r_text in raw_responses
            ]
            yes_responses = [
                r_text.lower().startswith("yes") and is_valid
                for r_text, is_valid in zip(raw_responses, valid_responses)
            ]
            no_responses = [
                r_text.lower().startswith("no") and is_valid
                for r_text, is_valid in zip(raw_responses, valid_responses)
            ]

            valid_responses = sum(valid_responses)
            yes_count = sum(yes_responses)
            no_count = sum(no_responses)
            explanations = raw_responses if request_explanation else []

        else:
            raise Exception(f"Model {model_type} is an unsupported type")

        # End of model routing logic --------------------------------------
        print(raw_responses)
        if request_explanation and valid_responses > 0:
            status_text.text("Summarizing explanations...")
            explanation_summary = summarize_explanations(explanations)
            status_text.empty()


        if valid_responses > 0:
            yes_percentage = yes_count / valid_responses * 100

            # Calculate the 95% confidence interval for the 'yes' probability
            ci_low, ci_high = beta.interval(0.95, yes_count + 1, no_count + 1)
            ci_low *= 100
            ci_high *= 100

            success_text = (
                f"Of {valid_responses} valid responses, Claude said 'yes' {yes_percentage:.1f}% of the time "
                f"(95% CI: [{ci_low:.1f}%, {ci_high:.1f}%])"
            )
            if request_explanation:
                success_text += (
                    "\n\nSummary of Explanations:\n" + explanation_summary
                )

            st.success(success_text)

            # Create a DataFrame from the raw responses
            df = pd.DataFrame({"Response": raw_responses})

            # Create a custom download button for the raw responses
            download_button_str = get_download_button(
                df, "raw_responses.csv", "Download Raw Responses"
            )
            st.markdown(download_button_str, unsafe_allow_html=True)
        else:
            st.error("No valid responses received from Claude.")


if __name__ == "__main__":
    main()
