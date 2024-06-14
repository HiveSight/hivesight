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


async def query_openai_async(
    system_prompt,
    question,
    model_type,
    request_explanation,
    num_queries,
    temperature=1.0,
    top_p=None,
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


async def query_openai_with_multiple_prompts(
    system_prompts,
    question,
    model_type,
    request_explanation,
    num_queries,
    temperature=1.0,
    top_p=None,
):
    tasks = [
        query_openai_async(
            system_prompt,
            question,
            model_type,
            request_explanation,
            num_queries,
            temperature,
            top_p
        )
        for system_prompt in system_prompts 
    ]
    responses = await asyncio.gather(*tasks)
    return responses


async def main():

    question = "Should we implement universal basic income?",
    prompts = [
        "You are a 40 year old lifelong republican. Answer the question starting with 'Yes' or 'No'",
        "You are a 40 year old lifelong democrat. Answer the question starting with 'Yes' or 'No'"
    ]
    model_type = "GPT-3.5"

    responses = await query_openai_with_multiple_prompts(
        prompts,
        question,
        model_type,
        True,
        3
    )
    return responses

#responses = asyncio.run(main())
#responses[0]
#responses[1]
