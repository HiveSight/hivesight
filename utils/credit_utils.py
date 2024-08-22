import re

import pandas as pd
import streamlit as st
from supabase import create_client, Client
import stripe


supabase = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_ROLE_SECRET"])


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
    # Note: the unpaid sessions go into the Stripe database
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
