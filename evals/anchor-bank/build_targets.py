"""Build the anchor item bank: human targets from GSS 2024 and SHED 2024.

Outputs:
  evals/anchor-bank/anchor-bank-v1.json  — items with wordings, options,
    weighted human option distributions (topline + slices), valence, domain.
  <scratch>/gss-respondents.json.gz, <scratch>/shed-respondents.json.gz —
    respondent-level extracts (demographics, responses, weight) for the RF
    baseline and PPI analyses. Not committed.

GSS: cumulative 1972-2024 R2 .dta read with convert_categoricals=False
(value labels carry non-UTF8 bytes); item response codes are mapped
explicitly from the GSS codebook. Negative codes are missing (R2 convention).
SHED: 2024 public-use CSV ships labeled strings; mapped explicitly from the
May 2025 codebook. housing_cost_stress replicates the composite from the
original HiveSight normalizer (tenure-specific hardship signals).

Run: uv run --with pandas python evals/anchor-bank/build_targets.py
"""

import gzip
import json
import os

import pandas as pd

SCRATCH = os.environ.get(
    "HS_SCRATCH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad",
)
GSS_DTA = "/Users/maxghenis/HiveSight/hivesight-calibration/data/gss7224_r2.dta"
SHED_CSV = os.path.join(SCRATCH, "public2024.csv")
OUT = os.path.join(os.path.dirname(__file__), "anchor-bank-v1.json")

MIN_BIN_N = 30
MIN_ITEM_N = 600

# ---------------------------------------------------------------- GSS items

CONF_WORDING = (
    "I am going to name some institutions in this country. As far as the people "
    "running these institutions are concerned, would you say you have a great deal "
    "of confidence, only some confidence, or hardly any confidence at all in them? {inst}"
)
CONF_OPTIONS = ["A great deal", "Only some", "Hardly any"]

NAT_WORDING = (
    "We are faced with many problems in this country, none of which can be solved "
    "easily or inexpensively. I'm going to name some of these problems, and for each "
    "one I'd like you to tell me whether you think we're spending too much money on "
    "it, too little money, or about the right amount. {prob}"
)
NAT_OPTIONS = ["Too little", "About the right amount", "Too much"]

AGREE4 = ["Strongly agree", "Agree", "Disagree", "Strongly disagree"]

# itemId: (gss variable, wording, options in code order 1..k, positive option
# indices, valence of the positive statistic, domain)
GSS_ITEMS = {
    "gss_happy": ("happy",
        "Taken all together, how would you say things are these days — would you say that you are very happy, pretty happy, or not too happy?",
        ["Very happy", "Pretty happy", "Not too happy"], [0], "positive", "wellbeing"),
    "gss_health": ("health",
        "Would you say your own health, in general, is excellent, good, fair, or poor?",
        ["Excellent", "Good", "Fair", "Poor"], [0, 1], "positive", "health"),
    "gss_satfin": ("satfin",
        "So far as you and your family are concerned, would you say that you are pretty well satisfied with your present financial situation, more or less satisfied, or not satisfied at all?",
        ["Pretty well satisfied", "More or less satisfied", "Not satisfied at all"], [0], "positive", "finance"),
    "gss_finrela": ("finrela",
        "Compared with American families in general, would you say your family income is far below average, below average, average, above average, or far above average?",
        ["Far below average", "Below average", "Average", "Above average", "Far above average"], [3, 4], "positive", "finance"),
    "gss_getahead": ("getahead",
        "Some people say that people get ahead by their own hard work; others say that lucky breaks or help from other people are more important. Which do you think is most important?",
        ["Hard work", "Both equally", "Luck or help"], [0], "neutral", "beliefs"),
    "gss_class": ("class",
        "If you were asked to use one of four names for your social class, which would you say you belong in: the lower class, the working class, the middle class, or the upper class?",
        ["Lower class", "Working class", "Middle class", "Upper class"], [2, 3], "positive", "identity"),
    "gss_fear": ("fear",
        "Is there any area right around here — that is, within a mile — where you would be afraid to walk alone at night?",
        ["Yes", "No"], [0], "negative", "safety"),
    "gss_cappun": ("cappun",
        "Do you favor or oppose the death penalty for persons convicted of murder?",
        ["Favor", "Oppose"], [0], "neutral", "policy"),
    "gss_gunlaw": ("gunlaw",
        "Would you favor or oppose a law which would require a person to obtain a police permit before he or she could buy a gun?",
        ["Favor", "Oppose"], [0], "neutral", "policy"),
    "gss_grass": ("grass",
        "Do you think the use of marijuana should be made legal or not?",
        ["Should be legal", "Should not be legal"], [0], "neutral", "policy"),
    "gss_courts": ("courts",
        "In general, do you think the courts in this area deal too harshly or not harshly enough with criminals?",
        ["Too harshly", "Not harshly enough", "About right"], [1], "neutral", "policy"),
    "gss_trust": ("trust",
        "Generally speaking, would you say that most people can be trusted or that you can't be too careful in dealing with people?",
        ["Most people can be trusted", "Can't be too careful", "Depends"], [0], "positive", "social"),
    "gss_fair": ("fair",
        "Do you think most people would try to take advantage of you if they got a chance, or would they try to be fair?",
        ["Would take advantage of you", "Would try to be fair", "Depends"], [1], "positive", "social"),
    "gss_helpful": ("helpful",
        "Would you say that most of the time people try to be helpful, or that they are mostly just looking out for themselves?",
        ["Try to be helpful", "Just look out for themselves", "Depends"], [0], "positive", "social"),
    "gss_satjob": ("satjob",
        "On the whole, how satisfied are you with the work you do — would you say you are very satisfied, moderately satisfied, a little dissatisfied, or very dissatisfied?",
        ["Very satisfied", "Moderately satisfied", "A little dissatisfied", "Very dissatisfied"], [0], "positive", "work"),
    "gss_aged": ("aged",
        "As you know, many older people share a home with their grown children. Do you think this is generally a good idea or a bad idea?",
        ["A good idea", "A bad idea", "Depends"], [0], "neutral", "family"),
    "gss_spanking": ("spanking",
        "Do you strongly agree, agree, disagree, or strongly disagree that it is sometimes necessary to discipline a child with a good, hard spanking?",
        AGREE4, [0, 1], "neutral", "family"),
    "gss_sexeduc": ("sexeduc",
        "Would you be for or against sex education in the public schools?",
        ["For", "Against"], [0], "neutral", "policy"),
    "gss_divlaw": ("divlaw",
        "Should divorce in this country be easier or more difficult to obtain than it is now?",
        ["Easier", "More difficult", "Stay as is"], [0], "neutral", "family"),
    "gss_fepol": ("fepol",
        "Tell me if you agree or disagree with this statement: Most men are better suited emotionally for politics than are most women.",
        ["Agree", "Disagree"], [1], "neutral", "gender"),
    "gss_fefam": ("fefam",
        "It is much better for everyone involved if the man is the achiever outside the home and the woman takes care of the home and family.",
        AGREE4, [2, 3], "neutral", "gender"),
    "gss_fechld": ("fechld",
        "A working mother can establish just as warm and secure a relationship with her children as a mother who does not work.",
        AGREE4, [0, 1], "neutral", "gender"),
    "gss_fepresch": ("fepresch",
        "A preschool child is likely to suffer if his or her mother works.",
        AGREE4, [2, 3], "neutral", "gender"),
    "gss_helppoor": ("helppoor",
        "Some people think that the government in Washington should do everything possible to improve the standard of living of all poor Americans. Other people think it is not the government's responsibility, and that each person should take care of himself. Where would you place yourself on this scale?",
        ["Government should improve living standards", "2", "Agree with both", "4", "People should take care of themselves"], [0, 1], "neutral", "policy"),
    "gss_helpsick": ("helpsick",
        "In general, some people think that it is the responsibility of the government in Washington to help people pay for doctors and hospital bills. Others think that these matters are not the responsibility of the federal government and that people should take care of these things themselves. Where would you place yourself on this scale?",
        ["Government should help", "2", "Agree with both", "4", "People should help themselves"], [0, 1], "neutral", "policy"),
    "gss_helpnot": ("helpnot",
        "Some people think that the government in Washington is trying to do too many things that should be left to individuals and private business. Others disagree and think that the government should do even more to solve our country's problems. Where would you place yourself on this scale?",
        ["Government should do more", "2", "Agree with both", "4", "Government does too much"], [0, 1], "neutral", "policy"),
    "gss_eqwlth": ("eqwlth",
        "Some people think that the government in Washington ought to reduce the income differences between the rich and the poor, perhaps by raising the taxes of wealthy families or by giving income assistance to the poor. Others think that the government should not concern itself with reducing this income difference between the rich and the poor. On a scale of 1 to 7 where 1 means the government ought to reduce income differences and 7 means the government should not concern itself, where would you place yourself?",
        ["1 (reduce differences)", "2", "3", "4", "5", "6", "7 (no action)"], [0, 1, 2], "neutral", "policy"),
    "gss_polviews": ("polviews",
        "We hear a lot of talk these days about liberals and conservatives. On a seven-point scale from extremely liberal to extremely conservative, where would you place yourself?",
        ["Extremely liberal", "Liberal", "Slightly liberal", "Moderate", "Slightly conservative", "Conservative", "Extremely conservative"], [0, 1, 2], "neutral", "identity"),
}

for var, inst in [
    ("confinan", "Banks and financial institutions"), ("conbus", "Major companies"),
    ("coneduc", "Education"), ("conpress", "The press"), ("conmedic", "Medicine"),
    ("conarmy", "The military"), ("confed", "The executive branch of the federal government"),
    ("conjudge", "The U.S. Supreme Court"), ("consci", "The scientific community"),
    ("conlegis", "Congress"),
]:
    GSS_ITEMS[f"gss_{var}"] = (
        var, CONF_WORDING.format(inst=inst), CONF_OPTIONS, [0], "neutral", "institutions",
    )

for var, prob in [
    ("natspac", "Space exploration"), ("natenvir", "Improving and protecting the environment"),
    ("natheal", "Improving and protecting the nation's health"),
    ("natcity", "Solving the problems of the big cities"), ("natcrime", "Halting the rising crime rate"),
    ("natdrug", "Dealing with drug addiction"), ("nateduc", "Improving the nation's education system"),
    ("natarms", "The military, armaments and defense"), ("nataid", "Foreign aid"),
    ("natfare", "Welfare"), ("natroad", "Highways and bridges"),
    ("natsoc", "Social Security"), ("natmass", "Mass transportation"),
    ("natpark", "Parks and recreation"), ("natchld", "Assistance for childcare"),
    ("natsci", "Supporting scientific research"), ("natenrgy", "Developing alternative energy sources"),
]:
    GSS_ITEMS[f"gss_{var}"] = (
        var, NAT_WORDING.format(prob=prob), NAT_OPTIONS, [0], "neutral", "spending",
    )

# --------------------------------------------------------------- SHED items

YN = ["Yes", "No"]

SHED_ITEMS = {
    "shed_b2": ("B2",
        "Overall, which one of the following best describes how well you are managing financially these days?",
        ["Living comfortably", "Doing okay", "Just getting by", "Finding it difficult to get by"],
        [0, 1], "positive", "finance"),
    "shed_b3": ("B3",
        "Compared to 12 months ago, would you say that you (and your family) are better off, the same, or worse off financially?",
        ["Much better off", "Somewhat better off", "About the same", "Somewhat worse off", "Much worse off"],
        [0, 1], "positive", "finance"),
    "shed_400cash": ("pay_casheqv",
        "Suppose that you have an emergency expense that costs $400. Would you pay for it with cash or its equivalent (money currently in your checking or savings account)?",
        YN, [0], "positive", "finance"),
    "shed_ef1": ("EF1",
        "Have you set aside emergency or rainy day funds that would cover your expenses for 3 months in case of sickness, job loss, economic downturn, or other emergencies?",
        YN, [0], "positive", "finance"),
    "shed_ef2": ("EF2",
        "If you were to lose your main source of income (for example, job or government benefits), could you cover your expenses for 3 months by borrowing money, using savings, or selling assets?",
        YN, [0], "positive", "finance"),
    "shed_ef7": ("EF7",
        "Based on your current financial situation, what is the largest emergency expense that you could handle right now using only your savings?",
        ["Under $100", "$100 to $499", "$500 to $999", "$1,000 to $1,999", "$2,000 or more"],
        [4], "positive", "finance"),
    "shed_bk1": ("BK1",
        "Do you (and/or your spouse or partner) currently have a checking, savings, or money market account?",
        YN, [0], "positive", "finance"),
    "shed_bnpl": ("BNPL1",
        "In the past year, have you used a “Buy Now, Pay Later” service to buy something?",
        YN, [0], "neutral", "finance"),
    "shed_work": ("D1A",
        "Last month, did you do any work for either pay or profit?",
        YN, [0], "neutral", "work"),
    "shed_i41d": ("I41_d",
        "In the past 12 months, have you (and/or your spouse or partner) received housing assistance from a government program?",
        YN, [0], "negative", "benefits"),
    "shed_housing_stress": ("housing_cost_stress",
        "Housing costs caused a serious hardship for my household, such as falling behind on rent or mortgage, facing foreclosure or eviction risk, or needing housing assistance.",
        YN, [0], "negative", "housing"),
}

SHED_EF7_ORDER = {
    "Under $100": 0, "$100 to $499": 1, "$500 to $999": 2,
    "$1,000 to $1,999": 3, "$2,000 or more": 4,
}

# ------------------------------------------------------------------ shared

def age_band(age):
    if age < 30:
        return "18-29"
    if age < 45:
        return "30-44"
    if age < 65:
        return "45-64"
    return "65+"


def weighted_dist(df, col_opt, weight_col, n_options):
    n = len(df)
    if n < MIN_BIN_N:
        return None
    w = df[weight_col]
    total = w.sum()
    dist = [float(w[df[col_opt] == i].sum() / total) for i in range(n_options)]
    return {"dist": dist, "n": int(n)}


def build_targets(df, col_opt, weight_col, n_options, slice_cols):
    out = {"overall": weighted_dist(df, col_opt, weight_col, n_options)}
    slices = {}
    for family, col in slice_cols.items():
        fam = {}
        for label, g in df.groupby(col, observed=True):
            if label is None or (isinstance(label, float) and pd.isna(label)):
                continue
            d = weighted_dist(g, col_opt, weight_col, n_options)
            if d:
                fam[str(label)] = d
        if len(fam) >= 2:
            slices[family] = fam
    out["slices"] = slices
    return out


# --------------------------------------------------------------------- GSS

def build_gss(items_out, respondents_out):
    item_vars = sorted({v[0] for v in GSS_ITEMS.values()})
    demo_vars = ["year", "age", "sex", "dwelown", "wtssps", "wtssnrps"]
    df = pd.read_stata(GSS_DTA, columns=demo_vars + item_vars, convert_categoricals=False)
    df = df[df["year"] == 2024].copy()
    print(f"GSS 2024 rows: {len(df)}")

    weight_col = "wtssnrps" if df.get("wtssnrps") is not None and df["wtssnrps"].gt(0).sum() > 1000 else "wtssps"
    df = df[df[weight_col] > 0].copy()
    print(f"  weight: {weight_col}, weighted rows: {len(df)}")

    df = df[df["age"] >= 18].copy()
    df["age_band"] = df["age"].apply(age_band)
    df["sex_label"] = df["sex"].map({1: "men", 2: "women"})
    df["tenure_label"] = df["dwelown"].map(
        {1: "homeowners", 2: "renters or other housing", 3: "renters or other housing"}
    )
    slice_cols = {"age_band": "age_band", "sex": "sex_label", "tenure": "tenure_label"}

    kept = 0
    for item_id, (var, wording, options, positive, valence, domain) in GSS_ITEMS.items():
        n_opt = len(options)
        sub = df[(df[var] >= 1) & (df[var] <= n_opt)].copy()
        if len(sub) < MIN_ITEM_N:
            print(f"  drop {item_id}: n={len(sub)}")
            continue
        sub["_opt"] = (sub[var] - 1).astype(int)
        items_out.append({
            "itemId": item_id, "source": "gss2024", "variable": var,
            "wording": wording, "options": options, "positiveOptions": positive,
            "valence": valence, "domain": domain,
            "targets": build_targets(sub, "_opt", weight_col, n_opt, slice_cols),
        })
        respondents_out.extend(
            {
                "itemId": item_id, "opt": int(r["_opt"]), "weight": float(r[weight_col]),
                "age": int(r["age"]), "sex": r["sex_label"],
                "tenure": r["tenure_label"] if isinstance(r["tenure_label"], str) else None,
            }
            for _, r in sub.iterrows()
        )
        kept += 1
    print(f"GSS items kept: {kept}")


# -------------------------------------------------------------------- SHED

SHED_INCOME_BAND = {
    "Less than $10,000": "<$25k", "$10,000 to $24,999": "<$25k",
    "$25,000 to $49,999": "$25k-$74,999", "$50,000 to $74,999": "$25k-$74,999",
    "$75,000 to $99,999": "$75k-$149,999", "$100,000 to $149,999": "$75k-$149,999",
    "$150,000 or more": "$150k+",
}


def shed_housing_stress(row):
    tenure = row["pprent"]
    if not isinstance(tenure, str):
        return None
    yes = lambda f: row.get(f) == "Yes"
    if tenure.startswith("Rented"):
        signals = ["R11", "R1_f", "R1_g", "R5B_c", "I41_d"]
    elif tenure.startswith("Owned"):
        signals = ["R5C_a", "R5C_b", "R5C_c", "I41_d"]
    else:
        signals = ["I41_d"]
    return 0 if any(yes(f) for f in signals) else 1  # option 0 = Yes


def build_shed(items_out, respondents_out):
    cols = ["weight", "ppage", "ppgender", "ppinc7", "pprent", "ppkid017",
            "R11", "R1_f", "R1_g", "R5B_c", "R5C_a", "R5C_b", "R5C_c",
            "ppstaten"] + [v[0] for v in SHED_ITEMS.values() if v[0] != "housing_cost_stress"]
    df = pd.read_csv(SHED_CSV, usecols=sorted(set(cols)), low_memory=False)
    print(f"SHED rows: {len(df)}")
    df = df[df["weight"] > 0].copy()
    df["age_band"] = df["ppage"].apply(age_band)
    df["sex_label"] = df["ppgender"].map({"Male": "men", "Female": "women"})
    df["income_band"] = df["ppinc7"].map(SHED_INCOME_BAND)
    df["tenure_label"] = df["pprent"].apply(
        lambda t: "homeowners" if isinstance(t, str) and t.startswith("Owned")
        else ("renters or other housing" if isinstance(t, str) else None)
    )
    slice_cols = {
        "age_band": "age_band", "income_band": "income_band",
        "sex": "sex_label", "tenure": "tenure_label",
    }

    for item_id, (var, wording, options, positive, valence, domain) in SHED_ITEMS.items():
        n_opt = len(options)
        if var == "housing_cost_stress":
            df["_opt"] = df.apply(shed_housing_stress, axis=1)
            sub = df[df["_opt"].notna()].copy()
            sub["_opt"] = sub["_opt"].astype(int)
        elif var == "EF7":
            sub = df[df[var].isin(SHED_EF7_ORDER)].copy()
            sub["_opt"] = sub[var].map(SHED_EF7_ORDER)
        else:
            label_to_idx = {label: i for i, label in enumerate(options)}
            observed = set(df[var].dropna().unique())
            unmapped = observed - set(label_to_idx) - {"Refused"}
            if unmapped:
                print(f"  NOTE {item_id}: unmapped labels {unmapped}")
            sub = df[df[var].isin(label_to_idx)].copy()
            sub["_opt"] = sub[var].map(label_to_idx)
        if len(sub) < MIN_ITEM_N:
            print(f"  drop {item_id}: n={len(sub)}")
            continue
        items_out.append({
            "itemId": item_id, "source": "shed2024", "variable": var,
            "wording": wording, "options": options, "positiveOptions": positive,
            "valence": valence, "domain": domain,
            "targets": build_targets(sub, "_opt", "weight", n_opt, slice_cols),
        })
        respondents_out.extend(
            {
                "itemId": item_id, "opt": int(r["_opt"]), "weight": float(r["weight"]),
                "age": int(r["ppage"]), "sex": r["sex_label"],
                "income_band": r["income_band"] if isinstance(r["income_band"], str) else None,
                "tenure": r["tenure_label"] if isinstance(r["tenure_label"], str) else None,
                "state": r["ppstaten"] if isinstance(r["ppstaten"], str) else None,
            }
            for _, r in sub.iterrows()
        )
    print(f"SHED items kept: {sum(1 for i in items_out if i['source'] == 'shed2024')}")


def main():
    items, gss_resp, shed_resp = [], [], []
    build_gss(items, gss_resp)
    build_shed(items, shed_resp)

    bank = {
        "version": "anchor-bank-v1",
        "minBinN": MIN_BIN_N,
        "minItemN": MIN_ITEM_N,
        "sources": {
            "gss2024": "GSS 1972-2024 cumulative R2 (gss7224_r2.dta), year==2024, weight wtssps/wtssnrps",
            "shed2024": "SHED 2024 public use file (Feb 2026 revision), weight `weight`",
        },
        "items": items,
    }
    with open(OUT, "w") as f:
        json.dump(bank, f, indent=1)
    print(f"\nwrote {OUT}: {len(items)} items "
          f"({sum(1 for i in items if i['source']=='gss2024')} GSS, "
          f"{sum(1 for i in items if i['source']=='shed2024')} SHED)")

    for name, rows in [("gss-respondents", gss_resp), ("shed-respondents", shed_resp)]:
        p = os.path.join(SCRATCH, f"{name}.json.gz")
        with gzip.open(p, "wt") as f:
            json.dump(rows, f)
        print(f"wrote {p}: {len(rows)} item-responses")


if __name__ == "__main__":
    main()
