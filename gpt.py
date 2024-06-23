import os
from openai import OpenAI, AsyncOpenAI, NOT_GIVEN as OPENAI_NOT_GIVEN
import streamlit as st

openai_api_key = os.getenv("OPENAI_API_KEY", st.secrets["OPENAI_API_KEY"])

openai_client = OpenAI()
openai_client_async = AsyncOpenAI()

EXPLANATION_APPEND = " Please provide an explanation."


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
        "GPT-4": "gpt-4-0125-preview",
        "Claude-3": "claude-3-opus-20240229",  # Note: This needs to be handled separately
    }
    top_p_input = OPENAI_NOT_GIVEN if top_p is None else top_p
    try:
        user_prompt = question
        if request_explanation:
            user_prompt = f"{user_prompt} {EXPLANATION_APPEND}"

        if model_type == "Claude-3":
            # Handle Claude-3 separately using the Anthropic API
            from anthropic import Anthropic

            anthropic_client = Anthropic(
                api_key=os.getenv(
                    "ANTHROPIC_API_KEY", st.secrets["ANTHROPIC_API_KEY"]
                )
            )
            response = anthropic_client.messages.create(
                model=model_map[model_type],
                max_tokens=500,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return [response.content[0].text.strip()]
        else:
            response = openai_client.chat.completions.create(
                model=model_map[model_type],
                temperature=temperature,
                top_p=top_p_input,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=500,
                n=num_queries,
            )
            return [r.message.content.strip() for r in response.choices]
    except Exception as e:
        print("Error during API call:", e)
    return ["Error or no data"]


def query_openai_batch(
    prompts, model_type, temperature=1.0, top_p=None, system_prompt=None
):
    responses = []
    for prompt in prompts:
        response = query_openai(
            prompt, model_type, False, 1, temperature, top_p, system_prompt
        )
        responses.extend(response)
    return responses
