import streamlit as st

# Set page config at the very beginning
st.set_page_config(layout="wide", page_title="🐝 HiveSight")

# Now import other necessary modules
import pandas as pd
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
with st.sidebar:
    st.header("About HiveSight")
    st.write("Built by Max Ghenis and Ben Ogorek using the OpenAI API")

    st.markdown("---")

    st.subheader("Developer Tools")
    all_code = gather_code()
    with st.expander("View All Code"):
        st.code(all_code, language="python", line_numbers=True)

# Main content
st.title("🐝 HiveSight")
st.write("Simulate Public Opinion with AI")

# Create two columns for the main controls
col1, col2 = st.columns(2)

with col1:
    question_ls = st.text_area(
        "Enter your statement for agreement/disagreement:",
        key="question_ls",
        help="Enter a statement that people can agree or disagree with.",
    )

with col2:
    num_queries = st.number_input(
        "Number of Responses",
        min_value=1,
        max_value=1000,
        value=10,
        step=1,
        help="Choose how many AI-generated responses you want.",
    )

    model_type = st.selectbox(
        "Choose Model Type",
        list(MODEL_MAP.keys()),
        help="Select the AI model to use for generating responses.",
    )

# Demographic filters in an expander
with st.expander("Demographic Filters", expanded=False):
    st.write("Set demographic filters for the simulated responses.")
    age_range = st.slider(
        "Age Range", 0, 100, (18, 100), help="Filter responses by age range."
    )
    income_range = st.slider(
        "Income Range ($)",
        0,
        1_000_000,
        (0, 1_000_000),
        step=10000,
        help="Filter responses by annual income range.",
    )

# Run Simulation button
if st.button(
    "Run Simulation",
    help="Click to start the simulation with the current settings.",
):
    if not question_ls.strip():
        st.error("Please enter a statement before running the simulation.")
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
                st.error(
                    "No valid responses were generated. Please try again or adjust your parameters."
                )
            else:
                st.session_state.responses = responses
                st.session_state.show_success = True

# Show success message if needed
if st.session_state.show_success:
    success_message = f"Simulation complete. Generated {len(st.session_state.responses)} valid responses."
    st.success(success_message)

# Results section
st.header("Simulation Results")

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
    st.info(
        "Welcome to HiveSight! To get started, enter a statement above and click 'Run Simulation'."
    )
    st.write(
        "Once you've run a simulation, you'll see the results and analysis here."
    )
