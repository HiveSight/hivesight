import os
import datetime
import json
import asyncio

import streamlit as st
import statsmodels.stats.proportion as smp
import pandas as pd
from custom_components import download_button
from gpt import query_openai
from anthropic import Anthropic
import gspread
from oauth2client.service_account import ServiceAccountCredentials

perspectives_df = pd.read_csv("perspectives.csv")

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", st.secrets["ANTHROPIC_API_KEY"])

anthropic_client = Anthropic(api_key=anthropic_api_key)

# Google Sheets setup -------
scope = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]
service_account_info = json.loads(st.secrets["GOOGLE_APPLICATION_CREDENTIALS_JSON"])
creds = ServiceAccountCredentials.from_json_keyfile_dict(
    service_account_info, scopes=scope
)
client = gspread.authorize(creds)
sheet = client.open_by_url(
    "https://docs.google.com/spreadsheets/d/13Ct9DKqxO3JM8ochPbJ40fNYy5jbpNgE7fwkfpQrnJc/edit#gid=0"
)
run_info_sheet = sheet.get_worksheet(0)
responses_sheet = sheet.get_worksheet(1)


def is_valid_response(response, request_explanation):
    response = response.strip("'\"")
    if request_explanation:
        return response.lower().startswith("yes") or response.lower().startswith("no")
    else:
        return response.lower() in ["yes", "no"]


def summarize_explanations(explanations):
    summary_prompt = (
        "Please provide a concise summary of the main points from the following explanations:\n\n"
        + "\n".join(explanations)
    )
    response = anthropic_client.messages.create(
        max_tokens=500,
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


def summarize_explanations_by_role(explanations, roles):
    system_prompt_intro = (
        "Please provide a concise summary of the main points from the following explanations, considering why someone in the role given would respond that way:\n\n"
    )

    output = []

    for role, explanation_list in zip(roles, explanations):
        formatted_explanations = "\n   * ".join(explanation_list)
        role_info = f"Role: {role}\nResponses:\n   * {formatted_explanations}\n"
        output.append(role_info)
    
    formatted_output = system_prompt_intro + "\n".join(output)
    print(formatted_output)

    response = anthropic_client.messages.create(
        max_tokens=500,
        model="claude-3-opus-20240229",
        messages=[{"role": "user", "content": formatted_output}],
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
    st.write("What do AIs think?")

    model_type = st.selectbox("Choose Model Type", ("GPT-3.5", "GPT-4o"))
    question = st.text_area("Enter your binary question")
    num_queries = st.number_input(
        "Number of Queries", min_value=1, max_value=100, value=10, step=1
    )
    request_explanation = st.checkbox("Request Explanation")

    perspective_type = st.radio(
        "Choose Perspective Type", ("Custom", "Random from Dataset")
    )

    if perspective_type == "Custom":
        role1 = st.text_input("Enter the first role or persona for the model to inhabit")
        role2 = st.text_input("Enter the second role or persona for the model to inhabit")
    else:
        # Select a random perspective from the dataset based on weights
        selected_perspective = perspectives_df.sample(n=1, weights="weight").iloc[0]
        role = f"{selected_perspective['age']}-year-old from {selected_perspective['state']} with a wage of {selected_perspective['wages']}"
        st.write(f"Selected Perspective: {role}")

    status_text = st.empty()

    more_options = st.expander("More Options")
    with more_options:
        temperature = st.number_input(
            label="Temperature",
            value=1.0,
            min_value=0.0,
            max_value=2.0,
            step=0.01,
        )

        use_top_p = st.checkbox("Use Top p")
        top_p = None
        if use_top_p:
            top_p = st.number_input(
                label="Top p",
                value=1.0,
                min_value=0.01,
                max_value=1.0,
                step=0.01,
            )

    if st.button("Run LLM Multiple Times"):

        SYSTEM_PROMPT = "You are roleplaying as a {role} who is answering a 'yes' or 'no' question based on their beliefs, values, and decision-making process. When the user provides a question or statement, carefully consider how the {role} would respond based on their perspective.\n\nIf the user's prompt ends with the instruction 'Please provide an explanation.', start your answer with 'Yes,' or 'No,' followed by a concise explanation of your response from the perspective of the {role}. If there are no instructions to provide an explanation, simply reply with 'Yes' or 'No' without any additional text.\n\nRemember to maintain the persona of the {role} throughout the interaction and provide responses that align with their likely opinions and thought processes."

        # These should come from the textboxes
        #role1 = "A 65 year old hardline republican"
        #role2 = "A 65 year old hardline democrat"

        #question = "Should we implement universal basic income (UBI) in the US?"

        # End hard-coded inputs
        roles = [role1, role2]
        print(roles)

        system_prompts = [SYSTEM_PROMPT.format(role=role) for role in [role1, role2]]

        async def get_responses_async():
            responses = await query_openai_with_multiple_prompts(
                system_prompts,
                question,
                model_type,
                True,
                3
            )
            return responses

        raw_responses = asyncio.run(main())

        #raw_responses = query_openai(
        #    question,
        #    model_type,
        #    request_explanation,
        #    num_queries,
        #    temperature,
        #    top_p=top_p,
        #    system_prompt=SYSTEM_PROMPT,
        #)
        for i in range(len(roles)):
            print(f"Computing stats for Role: {roles[i]}")
 
            valid_responses = [
                is_valid_response(r_text, request_explanation) for r_text in raw_responses[i]
            ]
            yes_responses = [
                r_text.lower().startswith("yes") and is_valid
                for r_text, is_valid in zip(raw_responses[i], valid_responses)
            ]
            no_responses = [
                r_text.lower().startswith("no") and is_valid
                for r_text, is_valid in zip(raw_responses[i], valid_responses)
            ]

            valid_responses = sum(valid_responses)
            yes_count = sum(yes_responses)
            no_count = sum(no_responses)
            explanations = raw_responses if request_explanation else []

            # End of model routing logic --------------------------------------

            if valid_responses > 0:
                yes_percentage = yes_count / valid_responses * 100

                # Calculate the 95% confidence interval for the 'yes' probability
                ci_low, ci_high = smp.proportion_confint(
                    yes_count, valid_responses, alpha=1 - 0.95, method="beta"
                )

                ci_low *= 100
                ci_high *= 100

                success_text = (
                    f"Role: {roles[i]}\n\n",
                    f"Of {valid_responses} valid responses, the LLM said 'yes' {yes_percentage:.1f}% of the time "
                    f"(95% CI: [{ci_low:.1f}%, {ci_high:.1f}%])"
                )
                #if request_explanation:
                #    success_text += "\n\nSummary of Explanations:\n" + explanation_summary

                st.success(success_text)

                # Create a DataFrame from the raw responses
                df = pd.DataFrame({"Response": raw_responses})

                # Create a custom download button for the raw responses
                download_button_str = get_download_button(
                    df, "raw_responses.csv", "Download Raw Responses"
                )
                st.markdown(download_button_str, unsafe_allow_html=True)

                # Send results to Google Spreadsheet
                run_timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                run_info_data = [
                    run_timestamp,
                    SYSTEM_PROMPT,
                    question,
                    model_type,
                    request_explanation,
                    num_queries,
                    temperature,
                    top_p,
                    yes_percentage,
                    ci_low,
                    ci_high,
                    "explanation_summary",
                ]
                #run_info_sheet.append_row(run_info_data)

                responses_data = [(run_timestamp, r) for r in raw_responses]
                #responses_sheet.append_rows(responses_data)
        else:
            st.error("No valid responses received.")

        if request_explanation and valid_responses > 0:
            status_text.text("Summarizing explanations...")
            #explanation_summary = summarize_explanations(explanations)
            explanation_summary = summarize_explanations_by_role(explanations, roles)
            success_text += "\n\nSummary of Explanations:\n" + explanation_summary
            status_text.empty()


if __name__ == "__main__":
    main()
