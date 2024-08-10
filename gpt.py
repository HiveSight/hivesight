import os
import asyncio
from openai import AsyncOpenAI
import streamlit as st
from config import MODEL_MAP
import time
import random

openai_api_key = os.getenv("OPENAI_API_KEY", st.secrets["OPENAI_API_KEY"])
openai_client_async = AsyncOpenAI()

# Configuration for rate limiting and retries
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 1  # in seconds
MAX_RETRY_DELAY = 60  # in seconds


async def query_openai_async(
    prompt,
    model_type,
    temperature=1.0,
    max_tokens=None,
):
    if not prompt:
        print("Error: Empty prompt provided")
        return "Error: Empty prompt"

    retries = 0
    while retries < MAX_RETRIES:
        try:
            messages = [{"role": "user", "content": prompt}]
            response = await openai_client_async.chat.completions.create(
                model=MODEL_MAP[model_type],
                temperature=temperature,
                messages=messages,
                max_tokens=max_tokens or 500,
                n=1,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            retries += 1
            if retries == MAX_RETRIES:
                print(f"Error during API call for model {model_type}:", e)
                return f"Error: {str(e)}"

            if "rate_limit_exceeded" in str(e):
                retry_delay = min(
                    INITIAL_RETRY_DELAY * (2 ** (retries - 1))
                    + random.uniform(0, 1),
                    MAX_RETRY_DELAY,
                )
                print(
                    f"Rate limit exceeded. Retrying in {retry_delay:.2f} seconds..."
                )
                await asyncio.sleep(retry_delay)
            else:
                print(f"Unexpected error. Retrying in 1 second...")
                await asyncio.sleep(1)


async def query_openai_batch(
    prompts,
    model_type,
    temperature=1.0,
    max_tokens=None,
):
    tasks = [
        query_openai_async(
            prompt,
            model_type,
            temperature,
            max_tokens,
        )
        for prompt in prompts
    ]
    return await asyncio.gather(*tasks)


def run_batch_query(prompts, model_type, temperature=1.0, max_tokens=None):
    return asyncio.run(
        query_openai_batch(prompts, model_type, temperature, max_tokens)
    )
