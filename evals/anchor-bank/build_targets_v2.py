"""Anchor bank v2: instrument-corrected items + historical targets.

Referee-driven corrections over v1 (see paper/pap-v3-addendum.md):
  - verbatim/card-faithful wordings (polviews, help* scales, battery stems,
    nat* option order, shed_b3, shed_400cash Fed definition)
  - volunteered-category flags for six GSS items (+ sexeduc gains its
    volunteered category, previously dropped)
  - provenance flags (native / derived / composite), universe notes
  - per-item DK/refused rates (GSS: excludes ballot nonassignment)
  - historical toplines (GSS 2022, SHED 2023) for the contamination
    regression: signed error vs 2022→2024 / 2023→2024 target movement

Outputs: anchor-bank-v2.json, historical-targets.json.
Slice machinery, thresholds, and weights identical to v1.

Run: uv run --with pandas python evals/anchor-bank/build_targets_v2.py
"""

import gzip
import json
import os

import pandas as pd

SCRATCH = os.environ.get(
    "HS_SCRATCH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad",
)
GSS_DTA = os.environ.get(
    "GSS_DTA",
    "/Users/maxghenis/HiveSight/hivesight-calibration/data/gss7224_r2.dta",
)
SHED_2024_CSV = os.path.join(SCRATCH, "public2024.csv")
SHED_2023_CSV = os.path.join(SCRATCH, "public2023.csv")
OUT = os.path.join(os.path.dirname(__file__), "anchor-bank-v2.json")
OUT_HIST = os.path.join(os.path.dirname(__file__), "historical-targets.json")

MIN_BIN_N = 30
MIN_ITEM_N = 600

BATTERY_STEM = (
    "Now I'm going to read several statements. As I read each one, please tell "
    "me whether you strongly agree, agree, disagree, or strongly disagree with it. — "
)
AGREE4 = ["Strongly agree", "Agree", "Disagree", "Strongly disagree"]

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
# v2: option order follows the question stem (too much / too little / about right).
NAT_OPTIONS = ["Too much money", "Too little money", "About the right amount"]
NAT_CODEMAP = {3: 0, 1: 1, 2: 2}  # GSS codes: 1 too little, 2 about right, 3 too much

# itemId -> dict spec. codes maps GSS numeric code -> option index.
# Defaults: provenance "native", no volunteered, identity codes (1..k -> 0..k-1).
GSS_ITEMS_V2 = {
    "gss_happy": dict(var="happy",
        wording="Taken all together, how would you say things are these days — would you say that you are very happy, pretty happy, or not too happy?",
        options=["Very happy", "Pretty happy", "Not too happy"], positive=[0], valence="positive", domain="wellbeing"),
    "gss_health": dict(var="health",
        wording="Would you say your own health, in general, is excellent, good, fair, or poor?",
        options=["Excellent", "Good", "Fair", "Poor"], positive=[0, 1], valence="positive", domain="health"),
    "gss_satfin": dict(var="satfin",
        wording="So far as you and your family are concerned, would you say that you are pretty well satisfied with your present financial situation, more or less satisfied, or not satisfied at all?",
        options=["Pretty well satisfied", "More or less satisfied", "Not satisfied at all"], positive=[0], valence="positive", domain="finance"),
    "gss_finrela": dict(var="finrela",
        wording="Compared with American families in general, would you say your family income is far below average, below average, average, above average, or far above average?",
        options=["Far below average", "Below average", "Average", "Above average", "Far above average"], positive=[3, 4], valence="positive", domain="finance"),
    "gss_getahead": dict(var="getahead",
        wording="Some people say that people get ahead by their own hard work; others say that lucky breaks or help from other people are more important. Which do you think is most important?",
        options=["Hard work", "Both equally", "Luck or help from other people"],
        positive=[0], valence="neutral", domain="beliefs", volunteered=[1]),
    "gss_class": dict(var="class",
        wording="If you were asked to use one of four names for your social class, which would you say you belong in: the lower class, the working class, the middle class, or the upper class?",
        options=["Lower class", "Working class", "Middle class", "Upper class"], positive=[2, 3], valence="positive", domain="identity"),
    "gss_fear": dict(var="fear",
        wording="Is there any area right around here — that is, within a mile — where you would be afraid to walk alone at night?",
        options=["Yes", "No"], positive=[0], valence="negative", domain="safety"),
    "gss_cappun": dict(var="cappun",
        wording="Do you favor or oppose the death penalty for persons convicted of murder?",
        options=["Favor", "Oppose"], positive=[0], valence="neutral", domain="policy"),
    "gss_gunlaw": dict(var="gunlaw",
        wording="Would you favor or oppose a law which would require a person to obtain a police permit before he or she could buy a gun?",
        options=["Favor", "Oppose"], positive=[0], valence="neutral", domain="policy"),
    "gss_grass": dict(var="grass",
        wording="Do you think the use of marijuana should be made legal or not?",
        options=["Should be legal", "Should not be legal"], positive=[0], valence="neutral", domain="policy"),
    "gss_courts": dict(var="courts",
        wording="In general, do you think the courts in this area deal too harshly or not harshly enough with criminals?",
        options=["Too harshly", "Not harshly enough", "About right"],
        positive=[1], valence="neutral", domain="policy", volunteered=[2]),
    "gss_trust": dict(var="trust",
        wording="Generally speaking, would you say that most people can be trusted or that you can't be too careful in dealing with people?",
        options=["Most people can be trusted", "Can't be too careful", "Depends"],
        positive=[0], valence="positive", domain="social", volunteered=[2]),
    "gss_fair": dict(var="fair",
        wording="Do you think most people would try to take advantage of you if they got a chance, or would they try to be fair?",
        options=["Would take advantage of you", "Would try to be fair", "Depends"],
        positive=[1], valence="positive", domain="social", volunteered=[2]),
    "gss_helpful": dict(var="helpful",
        wording="Would you say that most of the time people try to be helpful, or that they are mostly just looking out for themselves?",
        options=["Try to be helpful", "Just look out for themselves", "Depends"],
        positive=[0], valence="positive", domain="social", volunteered=[2]),
    "gss_satjob": dict(var="satjob",
        wording="On the whole, how satisfied are you with the work you do — would you say you are very satisfied, moderately satisfied, a little dissatisfied, or very dissatisfied?",
        options=["Very satisfied", "Moderately satisfied", "A little dissatisfied", "Very dissatisfied"],
        positive=[0], valence="positive", domain="work",
        universe="Asked of respondents who work for pay; estimate among employed members of this group."),
    "gss_spanking": dict(var="spanking",
        wording=BATTERY_STEM + "It is sometimes necessary to discipline a child with a good, hard spanking.",
        options=AGREE4, positive=[0, 1], valence="neutral", domain="family"),
    "gss_sexeduc": dict(var="sexeduc",
        wording="Would you be for or against sex education in the public schools?",
        options=["For", "Against", "Depends"], positive=[0], valence="neutral",
        domain="policy", volunteered=[2]),
    "gss_divlaw": dict(var="divlaw",
        wording="Should divorce in this country be easier or more difficult to obtain than it is now?",
        options=["Easier", "More difficult", "Stay as is"], positive=[0],
        valence="neutral", domain="family", volunteered=[2]),
    "gss_fepol": dict(var="fepol",
        wording="Tell me if you agree or disagree with this statement: Most men are better suited emotionally for politics than are most women.",
        options=["Agree", "Disagree"], positive=[1], valence="neutral", domain="gender"),
    "gss_fefam": dict(var="fefam",
        wording=BATTERY_STEM + "It is much better for everyone involved if the man is the achiever outside the home and the woman takes care of the home and family.",
        options=AGREE4, positive=[2, 3], valence="neutral", domain="gender"),
    "gss_fechld": dict(var="fechld",
        wording=BATTERY_STEM + "A working mother can establish just as warm and secure a relationship with her children as a mother who does not work.",
        options=AGREE4, positive=[0, 1], valence="neutral", domain="gender"),
    "gss_fepresch": dict(var="fepresch",
        wording=BATTERY_STEM + "A preschool child is likely to suffer if his or her mother works.",
        options=AGREE4, positive=[2, 3], valence="neutral", domain="gender"),
    "gss_helppoor": dict(var="helppoor",
        wording="Some people think that the government in Washington should do everything possible to improve the standard of living of all poor Americans; they are at Point 1 on this card. Other people think it is not the government's responsibility, and that each person should take care of himself; they are at Point 5 on this card. Where would you place yourself on this scale?",
        options=["1 — Government should do everything possible to improve the standard of living of all poor Americans",
                 "2", "3 — Agree with both answers", "4",
                 "5 — Each person should take care of himself"],
        positive=[0, 1], valence="neutral", domain="policy"),
    "gss_helpsick": dict(var="helpsick",
        wording="In general, some people think that it is the responsibility of the government in Washington to help people pay for doctors and hospital bills; they are at Point 1. Others think that these matters are not the responsibility of the federal government and that people should take care of these things themselves; they are at Point 5. Where would you place yourself on this scale?",
        options=["1 — Government should help people pay for doctors and hospital bills",
                 "2", "3 — Agree with both answers", "4",
                 "5 — People should take care of these things themselves"],
        positive=[0, 1], valence="neutral", domain="policy"),
    "gss_helpnot": dict(var="helpnot",
        wording="Some people think that the government in Washington is trying to do too many things that should be left to individuals and private business; they are at Point 5 on this card. Others disagree and think that the government should do even more to solve our country's problems; they are at Point 1. Where would you place yourself on this scale?",
        options=["1 — Government should do even more to solve our country's problems",
                 "2", "3 — Agree with both answers", "4",
                 "5 — Government is trying to do too many things that should be left to individuals and private business"],
        positive=[0, 1], valence="neutral", domain="policy"),
    "gss_eqwlth": dict(var="eqwlth",
        wording="Some people think that the government in Washington ought to reduce the income differences between the rich and the poor, perhaps by raising the taxes of wealthy families or by giving income assistance to the poor. Others think that the government should not concern itself with reducing this income difference between the rich and the poor. Think of a score of 1 as meaning that the government ought to reduce the income differences between rich and poor, and a score of 7 meaning that the government should not concern itself with reducing income differences. What score between 1 and 7 comes closest to the way you feel?",
        options=["1 — Government ought to reduce income differences", "2", "3", "4", "5", "6",
                 "7 — Government should not concern itself with reducing income differences"],
        positive=[0, 1, 2], valence="neutral", domain="policy"),
    "gss_polviews": dict(var="polviews",
        wording="We hear a lot of talk these days about liberals and conservatives. I'm going to show you a seven-point scale on which the political views that people might hold are arranged from extremely liberal — point 1 — to extremely conservative — point 7. Where would you place yourself on this scale?",
        options=["1 — Extremely liberal", "2 — Liberal", "3 — Slightly liberal",
                 "4 — Moderate, middle of the road", "5 — Slightly conservative",
                 "6 — Conservative", "7 — Extremely conservative"],
        positive=[0, 1, 2], valence="neutral", domain="identity"),
}

for var, inst in [
    ("confinan", "Banks and financial institutions"), ("conbus", "Major companies"),
    ("coneduc", "Education"), ("conpress", "The press"), ("conmedic", "Medicine"),
    ("conarmy", "The military"), ("confed", "The executive branch of the federal government"),
    ("conjudge", "The U.S. Supreme Court"), ("consci", "The scientific community"),
    ("conlegis", "Congress"),
]:
    GSS_ITEMS_V2[f"gss_{var}"] = dict(
        var=var, wording=CONF_WORDING.format(inst=inst), options=CONF_OPTIONS,
        positive=[0], valence="neutral", domain="institutions",
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
    GSS_ITEMS_V2[f"gss_{var}"] = dict(
        var=var, wording=NAT_WORDING.format(prob=prob), options=NAT_OPTIONS,
        positive=[1], valence="neutral", domain="spending", codes=NAT_CODEMAP,
    )

YN = ["Yes", "No"]

SHED_ITEMS_V2 = {
    "shed_b2": dict(var="B2",
        wording="Overall, which one of the following best describes how well you are managing financially these days?",
        options=["Living comfortably", "Doing okay", "Just getting by", "Finding it difficult to get by"],
        positive=[0, 1], valence="positive", domain="finance"),
    "shed_b3": dict(var="B3",
        wording="Compared to 12 months ago, would you say that you (and your family living with you) are better off, the same, or worse off financially?",
        options=["Much better off", "Somewhat better off", "About the same", "Somewhat worse off", "Much worse off"],
        positive=[0, 1], valence="positive", domain="finance"),
    "shed_400cash": dict(var="pay_casheqv",
        wording="Suppose that you have an emergency expense that costs $400. Would you pay for it with cash or its equivalent — that is, with cash, money currently in your checking or savings account, or a credit card that you pay in full at your next statement?",
        options=YN, positive=[0], valence="positive", domain="finance", provenance="derived"),
    "shed_ef1": dict(var="EF1",
        wording="Have you set aside emergency or rainy day funds that would cover your expenses for 3 months in case of sickness, job loss, economic downturn, or other emergencies?",
        options=YN, positive=[0], valence="positive", domain="finance"),
    "shed_ef2": dict(var="EF2",
        wording="If you were to lose your main source of income (for example, job or government benefits), could you cover your expenses for 3 months by borrowing money, using savings, or selling assets?",
        options=YN, positive=[0], valence="positive", domain="finance"),
    "shed_ef7": dict(var="EF7",
        wording="Based on your current financial situation, what is the largest emergency expense that you could handle right now using only your savings?",
        options=["Under $100", "$100 to $499", "$500 to $999", "$1,000 to $1,999", "$2,000 or more"],
        positive=[4], valence="positive", domain="finance"),
    "shed_bk1": dict(var="BK1",
        wording="Do you (and/or your spouse or partner) currently have a checking, savings, or money market account?",
        options=YN, positive=[0], valence="positive", domain="finance"),
    "shed_bnpl": dict(var="BNPL1",
        wording="In the past year, have you used a “Buy Now, Pay Later” service to buy something?",
        options=YN, positive=[0], valence="neutral", domain="finance"),
    "shed_work": dict(var="D1A",
        wording="Last month, did you do any work for either pay or profit?",
        options=YN, positive=[0], valence="neutral", domain="work"),
    "shed_i41d": dict(var="I41_d",
        wording="In the past 12 months, have you (and/or your spouse or partner) received housing assistance from a government program?",
        options=YN, positive=[0], valence="negative", domain="benefits", provenance="derived"),
    "shed_housing_stress": dict(var="housing_cost_stress",
        wording="Housing costs caused a serious hardship for my household, such as falling behind on rent or mortgage, facing foreclosure or eviction risk, or needing housing assistance.",
        options=YN, positive=[0], valence="negative", domain="housing", provenance="composite"),
}

SHED_EF7_ORDER = {
    "Under $100": 0, "$100 to $499": 1, "$500 to $999": 2,
    "$1,000 to $1,999": 3, "$2,000 or more": 4,
}
SHED_INCOME_BAND = {
    "Less than $10,000": "<$25k", "$10,000 to $24,999": "<$25k",
    "$25,000 to $49,999": "$25k-$74,999", "$50,000 to $74,999": "$25k-$74,999",
    "$75,000 to $99,999": "$75k-$149,999", "$100,000 to $149,999": "$75k-$149,999",
    "$150,000 or more": "$150k+",
}


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


def gss_frame(df_all, year):
    df = df_all[df_all["year"] == year].copy()
    weight_col = "wtssnrps" if df["wtssnrps"].gt(0).sum() > 1000 else "wtssps"
    df = df[(df[weight_col] > 0) & (df["age"] >= 18)].copy()
    df["age_band"] = df["age"].apply(age_band)
    df["sex_label"] = df["sex"].map({1: "men", 2: "women"})
    df["tenure_label"] = df["dwelown"].map(
        {1: "homeowners", 2: "renters or other housing", 3: "renters or other housing"}
    )
    return df, weight_col


def spec_codes(spec):
    if "codes" in spec:
        return spec["codes"]
    return {i + 1: i for i in range(len(spec["options"]))}


def positive_share(dist, positive):
    return float(sum(dist[i] for i in positive))


def main():
    items_out = []
    hist = {}

    # ------------------------------------------------------------- GSS
    item_vars = sorted({v["var"] for v in GSS_ITEMS_V2.values()})
    demo = ["year", "age", "sex", "dwelown", "wtssps", "wtssnrps"]
    df_all = pd.read_stata(GSS_DTA, columns=demo + item_vars, convert_categoricals=False)
    df24, w24 = gss_frame(df_all, 2024)
    df22, w22 = gss_frame(df_all, 2022)
    print(f"GSS 2024 rows {len(df24)} (weight {w24}); 2022 rows {len(df22)} (weight {w22})")
    slice_cols = {"age_band": "age_band", "sex": "sex_label", "tenure": "tenure_label"}

    for item_id, spec in GSS_ITEMS_V2.items():
        codes = spec_codes(spec)
        n_opt = len(spec["options"])

        def prep(df):
            sub = df[df[spec["var"]].isin(codes)].copy()
            sub["_opt"] = sub[spec["var"]].map(codes).astype(int)
            return sub

        sub24 = prep(df24)
        if len(sub24) < MIN_ITEM_N:
            print(f"  drop {item_id}: n={len(sub24)}")
            continue
        # DK rate: nonassigned ballots (-100) excluded from the denominator.
        raw = df24[spec["var"]]
        eligible = raw[raw != -100]
        dk_rate = float((~eligible.isin(codes)).mean()) if len(eligible) else None

        items_out.append({
            "itemId": item_id, "source": "gss2024", "variable": spec["var"],
            "wording": spec["wording"], "options": spec["options"],
            "positiveOptions": spec["positive"], "valence": spec["valence"],
            "domain": spec["domain"],
            "volunteered": spec.get("volunteered", []),
            "provenance": spec.get("provenance", "native"),
            "universeNote": spec.get("universe"),
            "dkRate": dk_rate,
            "targets": build_targets(sub24, "_opt", w24, n_opt, slice_cols),
        })
        sub22 = prep(df22)
        if len(sub22) >= MIN_ITEM_N:
            d22 = weighted_dist(sub22, "_opt", w22, n_opt)
            hist[item_id] = {"year": 2022, "positiveShare": positive_share(d22["dist"], spec["positive"]), "n": d22["n"]}

    # ------------------------------------------------------------ SHED
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
        return 0 if any(yes(f) for f in signals) else 1

    def load_shed(path):
        want = ["weight", "ppage", "ppgender", "ppinc7", "pprent", "ppkid017",
                "R11", "R1_f", "R1_g", "R5B_c", "R5C_a", "R5C_b", "R5C_c"] + [
                v["var"] for v in SHED_ITEMS_V2.values() if v["var"] != "housing_cost_stress"]
        cols = pd.read_csv(path, nrows=0).columns
        df = pd.read_csv(path, usecols=[c for c in sorted(set(want)) if c in cols], low_memory=False)
        df = df[df["weight"] > 0].copy()
        df["age_band"] = df["ppage"].apply(age_band)
        df["sex_label"] = df["ppgender"].map({"Male": "men", "Female": "women"})
        df["income_band"] = df["ppinc7"].map(SHED_INCOME_BAND)
        df["tenure_label"] = df["pprent"].apply(
            lambda t: "homeowners" if isinstance(t, str) and t.startswith("Owned")
            else ("renters or other housing" if isinstance(t, str) else None)
        )
        return df

    shed24 = load_shed(SHED_2024_CSV)
    shed23 = load_shed(SHED_2023_CSV) if os.path.exists(SHED_2023_CSV) else None
    print(f"SHED 2024 rows {len(shed24)}; 2023 rows {len(shed23) if shed23 is not None else 'N/A'}")
    shed_slices = {"age_band": "age_band", "income_band": "income_band",
                   "sex": "sex_label", "tenure": "tenure_label"}

    def shed_prep(df, spec):
        var, options = spec["var"], spec["options"]
        if var == "housing_cost_stress":
            if not {"R11", "R5C_a"}.issubset(df.columns):
                return None
            s = df.copy()
            s["_opt"] = s.apply(shed_housing_stress, axis=1)
            s = s[s["_opt"].notna()].copy()
            s["_opt"] = s["_opt"].astype(int)
            return s
        if var not in df.columns:
            return None
        if var == "EF7":
            s = df[df[var].isin(SHED_EF7_ORDER)].copy()
            s["_opt"] = s[var].map(SHED_EF7_ORDER)
            return s
        label_to_idx = {label: i for i, label in enumerate(options)}
        s = df[df[var].isin(label_to_idx)].copy()
        s["_opt"] = s[var].map(label_to_idx)
        return s

    for item_id, spec in SHED_ITEMS_V2.items():
        n_opt = len(spec["options"])
        sub24 = shed_prep(shed24, spec)
        if sub24 is None or len(sub24) < MIN_ITEM_N:
            print(f"  drop {item_id}")
            continue
        raw = shed24[spec["var"]] if spec["var"] in shed24.columns else None
        dk_rate = float((raw == "Refused").mean()) if raw is not None else None
        items_out.append({
            "itemId": item_id, "source": "shed2024", "variable": spec["var"],
            "wording": spec["wording"], "options": spec["options"],
            "positiveOptions": spec["positive"], "valence": spec["valence"],
            "domain": spec["domain"],
            "volunteered": spec.get("volunteered", []),
            "provenance": spec.get("provenance", "native"),
            "universeNote": spec.get("universe"),
            "dkRate": dk_rate,
            "targets": build_targets(sub24, "_opt", "weight", n_opt, shed_slices),
        })
        if shed23 is not None:
            sub23 = shed_prep(shed23, spec)
            if sub23 is not None and len(sub23) >= MIN_ITEM_N:
                d23 = weighted_dist(sub23, "_opt", "weight", n_opt)
                hist[item_id] = {"year": 2023, "positiveShare": positive_share(d23["dist"], spec["positive"]), "n": d23["n"]}

    bank = {
        "version": "anchor-bank-v2",
        "amends": "anchor-bank-v1 (see paper/pap-v3-addendum.md)",
        "minBinN": MIN_BIN_N, "minItemN": MIN_ITEM_N,
        "items": items_out,
    }
    json.dump(bank, open(OUT, "w"), indent=1)
    json.dump({"version": "historical-v1", "items": hist}, open(OUT_HIST, "w"), indent=1)
    print(f"wrote {OUT}: {len(items_out)} items "
          f"({sum(1 for i in items_out if i['source']=='gss2024')} GSS, "
          f"{sum(1 for i in items_out if i['source']=='shed2024')} SHED)")
    print(f"wrote {OUT_HIST}: {len(hist)} historical toplines")


if __name__ == "__main__":
    main()
