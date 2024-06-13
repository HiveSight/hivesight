import os
import asyncio

from openai import OpenAI, AsyncOpenAI, NOT_GIVEN as OPENAI_NOT_GIVEN
import streamlit as st


openai_api_key = os.getenv("OPENAI_API_KEY", st.secrets["OPENAI_API_KEY"])

openai_client = OpenAI()
openai_client_async = AsyncOpenAI()


EXPLANATION_APPEND = " Please provide an explanation."

MAX_TOKENS_EXPLANATION = 500


def query_openai(
    question,
    model_type,
    request_explanation,
    num_queries,
    temperature=1.0,
    top_p=None,
    system_prompt=None,
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
            max_tokens = MAX_TOKENS_EXPLANATION
        else:
            max_tokens = (
                1  # Limit to one token for yes/no without explanation.
            )

        response = openai_client.chat.completions.create(
            model=model_map[model_type],
            temperature=temperature,
            top_p=top_p_input,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            n=num_queries,
        )

        if response.choices[0].message.content:
            return [r.message.content.strip() for r in response.choices]
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


async def query_openai(
    question,
    model_type,
    request_explanation,
    num_queries,
    temperature=1.0,
    top_p=None,
    system_prompt=None,
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
            max_tokens = MAX_TOKENS_EXPLANATION
        else:
            max_tokens = 1  # Limit to one token for yes/no without explanation.

        async with AsyncOpenAI() as openai_client:
            response = await openai_client.chat.completions.create(
                model=model_map[model_type],
                temperature=temperature,
                top_p=top_p_input,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=max_tokens,
                n=num_queries,
            )

        if response.choices[0].message.content:
            return [r.message.content.strip() for r in response.choices]
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"

# Example usage

question = "Should we implement universal basic income?"
model_type = "GPT-4o"

test = asyncio.run(query_openai(question, model_type, True, 5, system_prompt = "Answer the question starting with Yes or No"))

test[4]

async def main():
    question1 = "Should we implement universal basic income?"
    question2 = "Should we lower taxes in 2025?"
    model_type = "GPT-4o"
    system_prompt = "Answer the question starting with Yes or No"

    task1 = query_openai(question1, model_type, True, 5, system_prompt=system_prompt)
    task2 = query_openai(question2, model_type, True, 5, system_prompt=system_prompt)

    responses = await asyncio.gather(task1, task2)
    return responses

responses = asyncio.run(main())

print("Response to question 1:", responses[0])
print("Response to question 2:", responses[1])


responses[0][1]
responses[0][2]

responses[1][2]
responses[1][3]



