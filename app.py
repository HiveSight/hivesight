import streamlit as st
import pandas as pd

# Set page config at the very beginning
st.set_page_config(layout="wide", page_title="🐝 HiveSight")

# Import other necessary modules
from visualization import create_enhanced_visualizations
from analysis import analyze_responses, create_pivot_table
from simulation import batch_simulate_responses
from custom_components import download_button
from config import MODEL_MAP
from gather_code import gather_code

# Initialize session state
if "responses" not in st.session_state:
    st.session_state.responses = None
if "show_success" not in st.session_state:
    st.session_state.show_success = False

# Sidebar
st.sidebar.title("🐝 HiveSight")
st.sidebar.write("Simulate Public Opinion with AI")

question_ls = st.sidebar.text_area(
    "Enter your statement in a form to agree or disagree with.",
    key="question_ls",
)

num_queries = st.sidebar.number_input(
    "Number of Responses",
    min_value=1,
    max_value=1000,
    value=10,
    step=1,
)

with st.sidebar.expander("Additional Options", expanded=False):
    model_type = st.selectbox(
        "Choose Model Type",
        list(MODEL_MAP.keys()),
    )
    st.write("Demographic Filters (optional)")
    age_range = st.slider("Age Range", 0, 100, (18, 100))
    income_range = st.slider(
        "Income Range ($)", 0, 1_000_000, (0, 1_000_000), step=10000
    )

if st.sidebar.button("Run Simulation"):
    if not question_ls.strip():
        st.sidebar.error(
            "Please enter a statement before running the simulation."
        )
    else:
        with st.spinner("Simulating responses..."):
            progress_bar = st.progress(0)
            responses = batch_simulate_responses(
                question_ls,
                None,  # No choices for Likert scale
                num_queries,
                model_type,
                age_range,
                income_range,
                "likert",  # Passing "likert" as a fixed parameter
                progress_callback=lambda x: progress_bar.progress(x),
            )

            if not responses:
                st.sidebar.error(
                    "No valid responses were generated. Please try again or adjust your parameters."
                )
            else:
                st.session_state.responses = responses
                st.session_state.show_success = True

# Show success message in sidebar if needed
if st.session_state.show_success:
    success_message = f"Simulation complete. Generated {len(st.session_state.responses)} valid responses."
    st.sidebar.success(success_message)

# Main panel
st.title("Simulation Results")

if st.session_state.responses:
    df = pd.DataFrame(st.session_state.responses)
    response_counts = analyze_responses(df)

    st.subheader("Overall Distribution")
    overall_viz = create_enhanced_visualizations(response_counts, None, None)
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
    st.write(
        "Welcome to HiveSight! To get started, enter a statement in the sidebar and click 'Run Simulation'."
    )
    st.write(
        "Once you've run a simulation, you'll see the results and analysis here."
    )

# Footer
st.sidebar.markdown("---")
st.sidebar.subheader("Developer Tools")
all_code = gather_code()
with st.sidebar.expander("View All Code"):
    st.code(all_code, language="python", line_numbers=True)
