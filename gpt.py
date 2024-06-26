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


async def query_openai_async2(
    system_prompt,
    question,
    model_type,
    num_queries,
    max_tokens,
    temperature=1.0,
    top_p=None,
):
    model_map = {
        "GPT-3.5": "gpt-3.5-turbo-0125",
        "GPT-4o": "gpt-4o",
    }
    top_p_input = OPENAI_NOT_GIVEN if top_p is None else top_p

    try:
        async with AsyncOpenAI() as openai_client:
            response = await openai_client.chat.completions.create(
                model=model_map[model_type],
                temperature=temperature,
                top_p=top_p_input,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question},
                ],
                max_tokens=max_tokens,
                n=num_queries,
            )

        if response.choices[0].message.content:
            return [r.message.content.strip() for r in response.choices]
    except Exception as e:
        print("Error during API call:", e)
    return "Error or no data"


PROMPT = """
You have the ability to randomly sample from a list of numbers, without bias. Every number has an equal chance of being selected.

Your task is to take a lookup table as input, and perform the following steps, but to output only one word at the end. Do not be chatty. Do the steps silently and respond with the one word:

 * Step 1: Find the number of elements in the Lookup Table, n.
 * Step 2. Randomly choose a number from the discrete set {1, ..., n}, (where n is the number from Step 1), and call the number you selected i.
 * Step 3. Find the word associated with i (the number from Step 2) using the lookup table.
 * Step 4. Respond only with the word you found in Step 3.

# Examples

Input:
  1: cat
  2: dog
  3. elephant
Step 1: n = 3 
Step 2: You randomly choose 1 from {1, ..., 3}; i = 1.
Step 3: You match i=1 to the word "cat" using the lookup table input
Step 4 (Output): cat
"""

question = """
  1: Apple
  2: Banana
  3: Pear
  4: Pineapple
  5: Starfruit
"""


PROMPT = """
# Instructions
You will randomly sample from a list, without bias. Every item has an equal chance of being selected.

Your task is to take a list, and perform the following steps, but to output only one word at the end. Do not be chatty. Do the steps silently and respond with the one word:

 * Step 1. Consider each item in the list with an equal probability of being selected. Specifically think about the probability of selecting the first word in the list and the last word in the list.
 * Step 2. Select one item from the list randomly, respecting the probabilities from Step 1. 
 * Step 3. Respond only with the item you selected in Step 2.

Remember, proceed step by step, and give each item, including the first and last, an equal chance of being selected.

# Example 1
Input: [cat, dog, elephant]
Output: cat

# Example 2
Input: [cat, dog, elephant]
Output: dog 
"""


PROMPT = """
# Instructions
You will randomly sample from a list, without bias. Every item has an equal chance of being selected.

Your task is to take a list, and perform the following steps, but to output only one word at the end. Do not be chatty. Do the steps silently and respond with the one word:

 * Step 1. Randomly permute the list in your mind, so that elements are in a random order
 * Step 2. Respond with the first item in your permuted list from Step 1. 

Remember, proceed step by step.

# Example 1
Input: [cat, dog, elephant]
Output: cat

# Example 2
Input: [cat, dog, elephant]
Output: dog 
"""

#PROMPT = """
#Return the first item from a list.
#
## Examples
#Input: {cat, dog, elephant}
#Output: cat
#"""

PROMPT = """
Randomly select an item from the input list.

# Examples
Input: [cat, dog, elephant]
Output: cat
Input: [cat, dog, elephant]
Output: cat 
Input: [cat, dog, elephant]
Output: dog
"""

PROMPT = """
Randomly sample between 1 and n, where n is an integer input you receive from the user. Do not be chatty. Respond only with the number you randomly sampled
"""

num_queries = 100
question = "10"
response = asyncio.run(query_openai_async2(
    PROMPT,
    question,
    model_type,
    num_queries,
    max_tokens,
    temperature=1,
    top_p=1,
))
r = np.array(response)
np.unique(r, return_counts=True)



PROMPT = """
You have the ability to randomly sample from a list, without bias. Every item has an equal chance of being selected.

Your task is to take a list, and perform the following steps:
 * Step 1. Consider each item in the list with an equal probability of being selected. Specifically think about the probability of selecting the first word in the list and the last word in the list.
 * Step 2. Select one item from the list randomly, respecting the probabilities from Step 1. 
 * Step 3. Respond with the item you selected in Step 2, followed by the probabilities you assigned in a python list after a comma.

Remember, proceed step by step, and give each item, including the first and last, an equal chance of being selected. Do not be chatty.

# Response Template
<selection>, <Python list of probabilities>

# Examples
Input: [cat, dog, elephant]
Output: cat, [.333, .333, .334]
Input: [cat, dog, elephant]
Output: cat, [.333, .333, .334]
Input: [cat, dog, elephant]
Output: dog, [.333, .333, .334]
"""

question = "[Apple, Banana, Kiwi, Pineapple, Starfruit]"

model_type = "GPT-4o"
num_queries = 25
max_tokens = 10  # A problem with limiting it to one token is that a fruit itself might be more than 1 token

response = asyncio.run(query_openai_async2(
    PROMPT,
    question,
    model_type,
    num_queries,
    max_tokens,
    temperature=1,
    top_p=1,
))
r = np.array(response)
np.unique(r, return_counts=True)




PROMPT = """
# Instructions
Your task is to take an input of the form <L, q>, where L is a list of descriptors about a person and q is a question you might ask that person. Do not be chatty. Do the steps silently and respond in the format instructed in under # Output Format. 

 * Step 1. Randomly permute the list in your mind, so that elements are in a random order
 * Step 2. Pick the first item in your permuted list from Step 1, and call it r.
 * Step 3. You now are a person described by r, the item you picked in Step 2. Think about your worldview as a person described by r.
 * Step 4. As a person described by r, answer the input question q, which should only require a 1-word answer. Answer it in one word if possible. If it is not possible, then respond "NA".

Remember, proceed step by step.

# Output Format
role, response to question

# Example 1
Input: ["Republican", "Democrat", "Independent"], "Do you support Univeral Basic Income by 2030?"
Output: "Republican", "No" 
"""

model_type = "GPT-4o"
num_queries = 25
max_tokens = 15  # A problem with limiting it to one token is that a fruit itself might be more than 1 token

question="""
["10 year old boy", "40 year old man", "80 year old man"], "Do you like purple Kool Aid, yes or no?"
"""

response = asyncio.run(query_openai_async2(
    PROMPT,
    question,
    model_type,
    num_queries,
    max_tokens,
    temperature=1,
    top_p=1,
))
r = np.array(response)
np.unique(r, return_counts=True)




