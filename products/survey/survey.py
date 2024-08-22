import streamlit as st
import pandas as pd
from supabase import create_client, Client
import stripe
# from st_paywall.google_auth import get_logged_in_user_email

from products.survey.visualization import create_enhanced_visualizations
from products.survey.analysis import analyze_responses, create_pivot_table
from products.survey.simulation import batch_simulate_responses
from products.survey.data_handling import select_diverse_personas                                                                                                                                                                      
from products.survey.prompts import create_prompt  
from utils.custom_components import download_button
from utils.openai_utils import estimate_input_tokens
from utils.credit_utils import (
    get_or_create_stripe_customer,
    get_total_user_credits_spent,
    get_credits_purchased_ever,
    purchase_credits
)
from config import MODEL_MAP, MODEL_COST_MAP


def init_session_state():
    if "responses" not in st.session_state:
        st.session_state.responses = None
    if "show_success" not in st.session_state:
        st.session_state.show_success = False


def reset_step():
    st.session_state.step = 1


def render():
    init_session_state()

    st.title("🐝 HiveSight Survey")
    st.write("Simulate Public Opinion with AI")

    col1, col2 = st.columns(2)

    with col1:
        question_ls = st.text_area(
            "Enter your statement for agreement/disagreement:",
            key="widget",
            on_change=reset_step,
            help="Enter a statement that people can agree or disagree with.",
        )

    with col2:
        num_queries = st.number_input(
            "Number of Responses",
            min_value=1,
            max_value=1000,
            value=10,
            step=1,
            on_change=reset_step,
            help="Choose how many AI-generated responses you want.",
        )

        model_type = st.selectbox(
            "Choose Model Type",
            list(MODEL_MAP.keys()),
            help="Select the AI model to use for generating responses.",
        )

    with st.expander("Demographic Filters", expanded=False):
        st.write("Set demographic filters for the simulated responses.")
        age_range = st.slider(
            "Age Range",
            0,
            100,
            (18, 100),
            on_change=reset_step,
            help="Filter responses by age range.",
        )
        income_range = st.slider(
            "Income Range ($)",
            0,
            1_000_000,
            (0, 1_000_000),
            step=10000,
            on_change=reset_step,
            help="Filter responses by annual income range.",
        )

    # Step 1: Cost Estimation
    if st.session_state.step == 1:
        if st.button("Proceed to Cost Estimation", help="Get cost estimate and run simulation"):
            if not question_ls.strip():
                st.error("Please enter a statement before running the simulation.")
            else:
                question_type = "likert"
                choices = None
                personas = select_diverse_personas(num_queries, age_range, income_range)
                prompts = [create_prompt(persona, question_ls, question_type, choices) for persona in personas]
    
                input_tokens_est = estimate_input_tokens(prompts, model_type)
                output_tokens_est = 1 * num_queries
    
                input_tokens_cost = input_tokens_est * MODEL_COST_MAP[model_type].Input / 1E6
                output_tokens_cost = output_tokens_est * MODEL_COST_MAP[model_type].Output / 1E6
                total_cost = round(input_tokens_cost + output_tokens_cost, 5)
    
                st.session_state.cost_estimation = {
                    "input_tokens_est": input_tokens_est,
                    "output_tokens_est": output_tokens_est,
                    "total_cost": total_cost,
                    "personas": personas,
                    "prompts": prompts
                }
                st.session_state.step = 2
                st.rerun()
    
    # Step 2: Run Simulation
    elif st.session_state.step == 2:
        cost_data = st.session_state.cost_estimation
        st.write("#### Cost estimation")
        st.write(f"**Tokens:** {cost_data['input_tokens_est']} input, "
                 f"{cost_data['output_tokens_est']} output")
        st.write(f"**Total Cost:** {cost_data['total_cost']}")

        #supabase: Client = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_ROLE_SECRET"])
        #stripe.api_key = st.secrets["stripe_api_key_test"]
        #user_email = get_logged_in_user_email()

        # TESTING: Porting over Credit logic from baogorek/stripe-initial
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
                st.rerun()

        # END TESTING of port ----- 

        enough_credits = True 
        st.write(f"TESTING: enough credits is {enough_credits}")

        if enough_credits:
            if st.button("Run Simulation", help="Click to start the simulation with the current settings."):
                run_simulation(question_ls, num_queries, model_type, cost_data['personas'], cost_data['prompts'])
                show_results()
        else:
            if st.button("Buy More Credits", help="Click to start a Stripe checkout session."):
                st.write("Buy More Credits")



def run_simulation(
    question_ls, num_queries, model_type, personas, prompts
):
    with st.spinner("Simulating responses..."):
        progress_bar = st.progress(0)
        responses = batch_simulate_responses(
            question_ls,
            None,  # No choices for Likert scale
            num_queries,
            model_type,
            personas,
            prompts,
            "likert",  # Passing "likert" as a fixed parameter
            progress_callback=lambda x: progress_bar.progress(x),
        )

        if not responses:
            st.error(
                "No valid responses were generated. Please try again or adjust your parameters."
            )
        else:
            st.session_state.responses = responses
            st.session_state.show_success = True


def show_results():
    if st.session_state.show_success:
        success_message = f"Simulation complete. Generated {len(st.session_state.responses)} valid responses."
        st.success(success_message)

    st.header("Simulation Results")

    if st.session_state.responses:
        df = pd.DataFrame(st.session_state.responses)
        response_counts = analyze_responses(df)

        st.subheader("Overall Distribution")
        overall_viz = create_enhanced_visualizations(
            response_counts, None, None
        )
        st.plotly_chart(overall_viz[0], use_container_width=True)

        st.subheader("Demographic Breakdown")
        breakdown_type = st.selectbox(
            "Select breakdown type:", ("By Age", "By Income")
        )

        if breakdown_type == "By Age":
            age_pivot = create_pivot_table(df, "age")
            age_viz = create_enhanced_visualizations(
                response_counts, age_pivot, "age"
            )
            st.plotly_chart(age_viz[1], use_container_width=True)
        elif breakdown_type == "By Income":
            income_pivot = create_pivot_table(df, "income")
            income_viz = create_enhanced_visualizations(
                response_counts, income_pivot, "income"
            )
            st.plotly_chart(income_viz[1], use_container_width=True)

        download_button_str = download_button(
            df, "simulated_responses.csv", "Download Simulated Responses"
        )
        st.markdown(download_button_str, unsafe_allow_html=True)

    else:
        st.info(
            "Welcome to HiveSight Survey! To get started, enter a statement above and click 'Run Simulation'."
        )
        st.write(
            "Once you've run a simulation, you'll see the results and analysis here."
        )


if __name__ == "__main__":
    render()
