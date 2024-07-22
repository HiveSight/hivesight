import os
import datetime
import json
import re

import streamlit as st
import statsmodels.stats.proportion as smp
import pandas as pd
from custom_components import download_button
from gpt import query_openai
from anthropic import Anthropic
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from supabase import create_client, Client
import stripe
from st_paywall import add_auth
from st_paywall.google_auth import get_logged_in_user_email, show_login_button


# Experimental mock payment section
# Set up clients
supabase: Client = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_ROLE_SECRET"])
stripe.api_key = st.secrets["stripe_api_key_test"]

# Part of st_paywall that just deals with Google Auth (in src/st_paywall/aggregate_auth.py
# This sets st.session_state["email"] if it's not already set
get_logged_in_user_email()

if "email" not in st.session_state.keys():
    show_login_button(
        text="Login with Google", color="#FD504D", sidebar=True
    )
    st.stop()

if st.sidebar.button("Logout", type="primary"):
    del st.session_state.email
    st.rerun()


st.title('Experimental Credit Management System')

def get_or_create_stripe_customer(email):
    customers = stripe.Customer.list(email=email).data
    if customers:
        return customers[0]
    else:
        customer = stripe.Customer.create(email=email)
        return customer


def get_total_user_credits_spent(email):
    response = supabase.table('credit_usage_history').select('*').eq('email', email).execute()
    if response.data:
        return pd.DataFrame(response.data)


def update_credit_usage_history(email, credits_used):
    supabase.table('credit_usage_history').insert({'email': email, 'credits_used': credits_used}).execute()


def extract_leading_integer(product_name):
    match = re.match(r'(\d+)', product_name)
    return int(match.group(1)) if match else 0


def get_credits_purchased_ever(customer):
    session_list = stripe.checkout.Session.list(customer=customer)
    data = []
    
    for session in session_list.auto_paging_iter():
        session_id = session.id
        product_name = session.metadata.get("product_name", "N/A")
        payment_status = session.payment_status
        data.append({
            "id": session_id,
            "product_name": product_name,
            "payment_status": payment_status
        })
    
    df = pd.DataFrame(data)
    if not df.empty:
        df['credits'] = df['product_name'].apply(extract_leading_integer)
        return df.loc[df.payment_status == "paid"]


def purchase_credits(customer):
    # Note: you can create a checkout session without any product in the catalog
    # But be careful how often you run this, because the unpaid sessions go into the Stripe database
    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        line_items=[{
            'price_data': {
                'currency': 'usd',
                'product_data': {
                    'name': '3 Credits Pack',
                },
                'unit_amount': 500,  # Price in cents
            },
            'quantity': 1,
        }],
        mode='payment',
        success_url="http://localhost:8501",
        cancel_url="http://localhost:8501",
        customer=customer.id,
        metadata={
            'product_name': '3 Credits Pack'
        }
    )
    
    print(f"[Stripe Payment link]({session['url']})")
    st.markdown(f"[Complete Payment my clicking here]({session['url']})")


# How to do interactive testing easily:
# class St:
#     def __init__(self):
#         self.session_state = {}
# 
# st = St()
# st.session_state['email'] = 'baogorek@gmail.com'


# Mock main loop --
if "email" in st.session_state.keys():
    # Will use local variables, as they will get populated in the "data pipeline" model,
    # and are still unique for each user session
    email = st.session_state["email"]
    customer = get_or_create_stripe_customer(email)
    st.write(f"The logged in email is {email}")
    st.write(f"The corresponding Stripe customer id is {customer.id}")

    st.write("-- Stripe purchase history -- ")
    credits_purchased_df = get_credits_purchased_ever(customer)
    if credits_purchased_df is not None:
        st.dataframe(credits_purchased_df)
        credits_purchased = credits_purchased_df.credits.sum()
    else:
        st.write("No Stripe purchase history yet")
        credits_purchased = 0

    st.write("--- Hivesight credit usage history  ---")
    credits_spent_df = get_total_user_credits_spent(email)
    if credits_spent_df is not None:
        st.dataframe(credits_spent_df)
        credits_used = credits_spent_df.credits_used.sum() 
    else:
        st.write("No Hivesight credit spending history yet")
        credits_used = 0

    credits_available = credits_purchased - credits_used
    st.write(f"You have {credits_available} Credits.")

    if credits_available < 1:
        st.write(f'If you want more credits, you will need to make a purchase from stripe.')
        if st.button("Get Stripe payment link to purchase 3 more stripe credits"):
            purchase_credits(customer)
    else:
        if st.button('Spend a Credit'):
            update_credit_usage_history(email, 1)
            st.success(f"You spent a credit.")
            st.rerun()   # I'd like to try markdown infusion to see if I could update this without a rerun
           

st.write("End Experimental Credit Payment Section----")

# Rest of app --------------
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
        role = st.text_input("Enter the role or persona for the model to inhabit")
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

        SYSTEM_PROMPT = f"You are roleplaying as a {role} who is answering a 'yes' or 'no' question based on their beliefs, values, and decision-making process. When the user provides a question or statement, carefully consider how the {role} would respond based on their perspective.\n\nIf the user's prompt ends with the instruction 'Please provide an explanation.', start your answer with 'Yes,' or 'No,' followed by a concise explanation of your response from the perspective of the {role}. If there are no instructions to provide an explanation, simply reply with 'Yes' or 'No' without any additional text.\n\nRemember to maintain the persona of the {role} throughout the interaction and provide responses that align with their likely opinions and thought processes."

        raw_responses = query_openai(
            question,
            model_type,
            request_explanation,
            num_queries,
            temperature,
            top_p=top_p,
            system_prompt=SYSTEM_PROMPT,
        )

        valid_responses = [
            is_valid_response(r_text, request_explanation) for r_text in raw_responses
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

        # End of model routing logic --------------------------------------
        print(raw_responses)
        if request_explanation and valid_responses > 0:
            status_text.text("Summarizing explanations...")
            explanation_summary = summarize_explanations(explanations)
            status_text.empty()

        if valid_responses > 0:
            yes_percentage = yes_count / valid_responses * 100

            # Calculate the 95% confidence interval for the 'yes' probability
            ci_low, ci_high = smp.proportion_confint(
                yes_count, valid_responses, alpha=1 - 0.95, method="beta"
            )

            ci_low *= 100
            ci_high *= 100

            success_text = (
                f"Of {valid_responses} valid responses, the LLM said 'yes' {yes_percentage:.1f}% of the time "
                f"(95% CI: [{ci_low:.1f}%, {ci_high:.1f}%])"
            )
            if request_explanation:
                success_text += "\n\nSummary of Explanations:\n" + explanation_summary

            st.success(success_text)
            print(SYSTEM_PROMPT)

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
                explanation_summary,
            ]
            run_info_sheet.append_row(run_info_data)

            responses_data = [(run_timestamp, r) for r in raw_responses]
            responses_sheet.append_rows(responses_data)

        else:
            st.error("No valid responses received.")


if __name__ == "__main__":
    main()
