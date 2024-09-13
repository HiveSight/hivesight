import re

import pandas as pd
import streamlit as st
from supabase import create_client, Client
import stripe

from config import (
    NEW_USER_FREE_CREDITS,
    CREDITS_PER_CENT_OF_COMPUTE,
    CREDIT_PRICE_IN_CENTS,
    PRESET_DOLLAR_AMOUNTS
)


supabase = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_ROLE_SECRET"])
stripe.api_key = st.secrets['stripe_api_key_test']  # TODO: Remove test mode as necessary


def get_or_create_stripe_customer(email):
    customers = stripe.Customer.list(email=email).data
    if customers:
        return customers[0]
    else:
        customer = stripe.Customer.create(email=email)
        add_extra_credits(email, NEW_USER_FREE_CREDITS)
        st.success("Welcome! You've earned 1000 free credits just by logging in!") 
        return customer


def get_total_user_credits_spent(email):
    response = supabase.table('credit_usage_history').select('*').eq('email', email).execute()
    if response.data:
        return pd.DataFrame(response.data)


def update_credit_usage_history(email, credits_used):
    supabase.table('credit_usage_history').insert({'email': email, 'credits_used': credits_used}).execute()


def add_extra_credits(email, extra_credits):
    supabase.table('extra_credits').insert({'email': email, 'credits': extra_credits}).execute()
    st.toast(f"Congrats! You just got {extra_credits} credits")


def get_extra_credits(email):
    response = supabase.table('extra_credits').select('*').eq('email', email).execute()
    if response.data:
        return pd.DataFrame(response.data)


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


def get_credits_available(email):
    customer = get_or_create_stripe_customer(email)

    credits_purchased_df = get_credits_purchased_ever(customer)
    if credits_purchased_df is not None:
        credits_purchased = credits_purchased_df.credits.sum()
    else:
        credits_purchased = 0

    credits_spent_df = get_total_user_credits_spent(email)
    if credits_spent_df is not None:
        credits_used = credits_spent_df.credits_used.sum() 
    else:
        credits_used = 0

    extra_credits_df = get_extra_credits(email)
    if extra_credits_df is not None:
        extra_credits = extra_credits_df.credits.sum() 
    else:
        extra_credits = 0

    credits_available = (credits_purchased + extra_credits) - credits_used
    return credits_available


def get_cost_in_credits(dollars_of_compute):
    return max(1, round(CREDITS_PER_CENT_OF_COMPUTE * 100 * dollars_of_compute))


def get_credit_bonus(user_dollars):
    """ Returns a factor that determines how much less computation a user gets per dollar

    Credits upon purchase is CREDITS_TO_USD_MULTIPLIER * user_dollars * DILUTION_FACTOR

    Args:
        user_dollars (float): dollars (USD) paid for the credits package
   """
    if user_dollars > 0 and user_dollars <= 5.0:
        credit_bonus = 50 
    elif user_dollars > 5.0 and user_dollars <= 10.0:
        credit_bonus = 100 
    elif user_dollars > 10.0:
        credit_bonus = 200 
    else:
        raise ValueError(f"{user_dollars} does not correspond to known range")
    return credit_bonus


def get_number_of_credits_with_purchase(user_dollars):
    base_credits_purchased = user_dollars * 100 * CREDIT_PRICE_IN_CENTS
    credits_bonus = get_credit_bonus(user_dollars)
    return int(round(base_credits_purchased + credits_bonus, -2))


def get_stripe_checkout_url(customer, number_of_credits, total_cost_in_usd):
    """ Creates a Stripe checkout session to buy a credits package using USD

    A checkout session doesn't need any product in the Stripe catalog, but
    every time this fuction is run with out the user completing the checkout,
    an unpaid session goes into the Stripe database (so run sparingly).

    Args:
        customer: a Stripe customer object. Only the id is used in the code.
        number_of_credits (int): the number of credits that the user will purchase
        total_cost_in_usd (float): the amount in USD that the user will pay for the 
          total credits package
    """
    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        line_items=[{
            'price_data': {
                'currency': 'usd',
                'product_data': {
                    'name': f"{number_of_credits:,} Credits Pack",
                },
                'unit_amount': total_cost_in_usd * 100,
            },
            'quantity': 1,
        }],
        mode='payment',
        # TODO: replace with final URLs. Key is to tell users their tab is still there
        success_url="https://baogorek.github.io/pages/",
        cancel_url="https://baogorek.github.io/pages/",
        customer=customer.id,
        metadata={
            'product_name': f"{number_of_credits} Credits Pack"
        }
    )
    return session['url']


def create_credit_purchase_sidebar():

    st.sidebar.title("Purchase Credits")
    credits_available = get_credits_available(st.session_state["email"])
    st.sidebar.write(f"You have {credits_available} credits currently")

    options = [
        f"${amount} (USD) for {get_number_of_credits_with_purchase(amount):,} credits "
        + f"(+{get_credit_bonus(amount)} credit bonus!)"
        for amount in PRESET_DOLLAR_AMOUNTS
    ]

    selected_package = st.sidebar.radio(
        'Choose a credits package to buy:', options
    )
    if st.sidebar.button("Get Stripe link to buy credits"):
        selected_index = options.index(selected_package)
        total_cost_in_usd = PRESET_DOLLAR_AMOUNTS[selected_index]
        number_of_credits = get_number_of_credits_with_purchase(total_cost_in_usd)
        customer = get_or_create_stripe_customer(st.session_state["email"])
        print(f"Customer {customer.id} has shown intent to buy")
        stripe_url = get_stripe_checkout_url(customer, number_of_credits, total_cost_in_usd)
        st.sidebar.markdown(f"[Complete Payment by clicking here]({stripe_url})")
        if st.sidebar.button("Update credits after making payment"):
            st.rerun()

def create_free_credits_sidebar():
    st.sidebar.title("Test Section for replenishing credits")
    free_test_credits = st.sidebar.number_input("How many free test credits?", min_value=1,
                                                max_value=10, value=5, step=1)
    if st.sidebar.button("Get Free Credits for Testing"):
        add_extra_credits(st.session_state['email'], free_test_credits)
        st.rerun()
