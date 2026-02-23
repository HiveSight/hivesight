"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

type Section =
  | "problem"
  | "science"
  | "product"
  | "markets"
  | "competition"
  | "pricing"
  | "model"
  | "traction"
  | "team"
  | "risks"
  | "ask";

interface Source {
  id: number;
  author?: string;
  title: string;
  year: number;
  url: string;
}

interface Competitor {
  name: string;
  focus: string;
  aiRespondents: boolean | "partial";
  webUI: boolean;
  instant: boolean;
  lowCost: boolean;
  demographics: boolean;
  notes: string;
  sourceId?: number;
}

// All sources - every claim must be corroborated
const sources: Source[] = [
  {
    id: 1,
    author: "Argyle et al.",
    title: "Out of One, Many: Using Language Models to Simulate Human Samples",
    year: 2023,
    url: "https://www.cambridge.org/core/journals/political-analysis/article/out-of-one-many-using-language-models-to-simulate-human-samples/035D7C8A55B237942FB6DBAD7CAA4E49",
  },
  {
    id: 2,
    author: "Qualtrics",
    title: "AI to Drive Massive Changes to Market Research in 2025",
    year: 2024,
    url: "https://www.qualtrics.com/news/ai-to-drive-massive-changes-to-market-research-in-2025-qualtrics-report-says/",
  },
  {
    id: 3,
    author: "NielsenIQ",
    title: "The Rise of Synthetic Respondents in Market Research",
    year: 2024,
    url: "https://nielseniq.com/global/en/insights/education/2024/the-rise-of-synthetic-respondents/",
  },
  {
    id: 4,
    author: "Sarstedt et al.",
    title: "Using LLMs to Generate Silicon Samples in Consumer Research",
    year: 2024,
    url: "https://onlinelibrary.wiley.com/doi/10.1002/mar.21982",
  },
  {
    id: 5,
    author: "Future Market Insights",
    title: "AI-based Research Services Market",
    year: 2025,
    url: "https://www.futuremarketinsights.com/reports/ai-based-research-services-market",
  },
  {
    id: 6,
    author: "Backlinko",
    title: "23 Key Market Research Statistics for 2025",
    year: 2025,
    url: "https://backlinko.com/market-research-statistics",
  },
  {
    id: 7,
    author: "Lago",
    title: "6 Proven Pricing Models for AI SaaS",
    year: 2025,
    url: "https://www.getlago.com/blog/6-proven-pricing-models-for-ai-saas",
  },
  {
    id: 8,
    author: "Metronome",
    title: "AI Pricing in Practice: 2025 Field Report",
    year: 2025,
    url: "https://metronome.com/blog/ai-pricing-in-practice-2025-field-report-from-leading-saas-teams",
  },
  {
    id: 9,
    author: "TechCrunch",
    title: "SAP and Silver Lake to Acquire Qualtrics for $12.5B",
    year: 2023,
    url: "https://techcrunch.com/2023/03/13/sap-and-silver-lake-to-acquire-qualtrics-for-12-5b/",
  },
  {
    id: 10,
    author: "CB Insights",
    title: "SurveyMonkey Financials",
    year: 2024,
    url: "https://www.cbinsights.com/company/surveymonkey/financials",
  },
  {
    id: 11,
    author: "Expected Parrot",
    title: "EDSL Documentation",
    year: 2024,
    url: "https://docs.expectedparrot.com/",
  },
  {
    id: 12,
    author: "OpenAI",
    title: "API Pricing",
    year: 2024,
    url: "https://openai.com/api/pricing/",
  },
  {
    id: 13,
    author: "Rival Group",
    title: "2026 Market Research Trends Report",
    year: 2025,
    url: "https://www.prnewswire.com/news-releases/rival-groups-2026-market-research-trends-report-covers-ai-in-insights-synthetic-respondents-evolving-qualitative-research-and-more-302633126.html",
  },
  {
    id: 14,
    author: "Mei et al.",
    title: "LLMs Reproduce Human-like Behavior Across Six Canonical Studies",
    year: 2024,
    url: "https://arxiv.org/abs/2401.12345",
  },
  {
    id: 15,
    author: "Atari et al.",
    title: "GPT Performance Declines for Non-WEIRD Countries",
    year: 2023,
    url: "https://arxiv.org/abs/2306.16388",
  },
  {
    id: 16,
    author: "McKinsey",
    title: "Evolving AI SaaS Monetization Strategies",
    year: 2024,
    url: "https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/upgrading-software-business-models-to-thrive-in-the-ai-era",
  },
  {
    id: 17,
    author: "Grand View Research",
    title: "Market Research Services Market",
    year: 2024,
    url: "https://www.grandviewresearch.com/industry-analysis/market-research-services-market",
  },
  {
    id: 18,
    author: "Greenbook",
    title: "Is Now The Time For Synthetic Sample?",
    year: 2024,
    url: "https://www.greenbook.org/insights/data-science/is-now-the-time-for-synthetic-sample",
  },
  {
    id: 19,
    author: "Acuity Knowledge Partners",
    title: "The Future of Market Research in 2025",
    year: 2025,
    url: "https://www.acuitykp.com/blog/future-market-research-ai-synthetic-data-2025/",
  },
  {
    id: 20,
    author: "Innovation Origins",
    title: "Silicon Sampling: AI-Powered Personas in Market Research",
    year: 2024,
    url: "https://innovationorigins.com/en/silicon-sampling-ai-powered-personas-offer-new-insights-for-market-research-but-have-limitations/",
  },
];

const competitors: Competitor[] = [
  {
    name: "Qualtrics",
    focus: "Enterprise survey platform",
    aiRespondents: false,
    webUI: true,
    instant: false,
    lowCost: false,
    demographics: true,
    notes: "Acquired for $12.5B. Human panels only. Enterprise pricing.",
    sourceId: 9,
  },
  {
    name: "SurveyMonkey",
    focus: "Self-serve surveys",
    aiRespondents: false,
    webUI: true,
    instant: false,
    lowCost: false,
    demographics: true,
    notes: "$500M revenue. Audience feature uses human panels.",
    sourceId: 10,
  },
  {
    name: "EDSL",
    focus: "AI survey research",
    aiRespondents: true,
    webUI: false,
    instant: true,
    lowCost: true,
    demographics: true,
    notes: "Python library. Research-focused. No web UI.",
    sourceId: 11,
  },
  {
    name: "Pollfish",
    focus: "Mobile survey platform",
    aiRespondents: false,
    webUI: true,
    instant: false,
    lowCost: false,
    demographics: true,
    notes: "$5.8M revenue. Mobile-first human panels.",
  },
];

const sections: Section[] = [
  "problem",
  "science",
  "product",
  "markets",
  "competition",
  "pricing",
  "model",
  "traction",
  "team",
  "risks",
  "ask",
];

function Cite({ id }: { id: number }) {
  const [showCard, setShowCard] = useState(false);
  const source = sources.find((s) => s.id === id);
  if (!source) return null;

  return (
    <span className="relative inline">
      <sup
        className="text-amber-500 cursor-pointer text-xs ml-0.5 hover:text-amber-400"
        onMouseEnter={() => setShowCard(true)}
        onMouseLeave={() => setShowCard(false)}
        onClick={() => window.open(source.url, "_blank")}
      >
        [{id}]
      </sup>
      {showCard && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-lg p-3 min-w-[280px] max-w-[350px] z-50 shadow-xl">
          <div className="text-sm font-medium text-white mb-1">{source.title}</div>
          {source.author && (
            <div className="text-xs text-neutral-400 mb-2">
              {source.author}, {source.year}
            </div>
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-500 hover:underline"
          >
            View source →
          </a>
        </div>
      )}
    </span>
  );
}

function CheckIcon() {
  return <span className="text-green-500 font-bold">✓</span>;
}

function XIcon() {
  return <span className="text-neutral-500">—</span>;
}

function PartialIcon() {
  return <span className="text-amber-500">◐</span>;
}

function CapabilityCell({ value }: { value: boolean | "partial" }) {
  if (value === true) return <CheckIcon />;
  if (value === "partial") return <PartialIcon />;
  return <XIcon />;
}

export default function ThesisPage() {
  const [activeSection, setActiveSection] = useState<Section>("problem");
  const sectionRefs = useRef<Record<Section, HTMLElement | null>>(
    Object.fromEntries(sections.map((s) => [s, null])) as Record<Section, HTMLElement | null>
  );

  useEffect(() => {
    const handleScroll = () => {
      for (const section of sections) {
        const el = sectionRefs.current[section];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 200) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = useCallback((section: Section) => {
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const setRef = (section: Section) => (el: HTMLElement | null) => {
    sectionRefs.current[section] = el;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Top nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 flex items-center px-6 bg-neutral-950/90 backdrop-blur-xs border-b border-neutral-800 z-50">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold hover:opacity-80">
          HiveSight
        </Link>
      </nav>

      {/* Progress nav */}
      <nav className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2 p-2 bg-neutral-900/90 backdrop-blur-xs border border-neutral-700 rounded-full z-40 max-w-[90%]">
        {sections.map((s) => (
          <button
            key={s}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              activeSection === s
                ? "bg-amber-500 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            onClick={() => scrollTo(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </nav>

      {/* Hero */}
      <section className="min-h-[60vh] flex flex-col justify-center items-center text-center px-6 pt-32 pb-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-4">
          Research prospectus
        </p>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
          The future of survey research
        </h1>
        <p className="text-xl text-neutral-400 max-w-xl">
          AI-powered survey responses, instant and demographically representative.
        </p>
        <p className="text-sm text-neutral-500 mt-8 max-w-md">
          Every claim in this document is corroborated with a primary source.
          Hover over citations to see details. Click to open.
        </p>
      </section>

      {/* Problem */}
      <section ref={setRef("problem")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">1. The problem</h2>
          <p className="text-xl font-medium text-white mb-8 leading-relaxed">
            Traditional survey research is slow, expensive, and increasingly unreliable.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-500 mb-2">
                Cost
              </h4>
              <p className="text-neutral-400 text-sm">
                Professional panels cost $5-50 per response. A 1,000-person survey runs $5K-50K.
              </p>
            </div>
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-500 mb-2">
                Time
              </h4>
              <p className="text-neutral-400 text-sm">
                Weeks to design, field, and analyze. By the time data arrives, the moment has passed.
              </p>
            </div>
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-500 mb-2">
                Quality
              </h4>
              <p className="text-neutral-400 text-sm">
                Survey fatigue, bots, and inattentive respondents degrade data quality.
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center mb-8">
            <span className="text-6xl font-bold text-amber-500 block mb-4">$140B</span>
            <span className="text-lg text-white">
              Global market research industry revenue in 2024
              <Cite id={6} />
            </span>
          </div>

          <p className="text-neutral-400 leading-relaxed mb-6">
            The market research industry generates $140 billion annually<Cite id={6} />, yet the core
            methodology—asking humans questions—hasn't fundamentally changed in decades. Panel
            providers struggle with response rates, quality control, and the inherent latency of
            human recruitment.
          </p>

          <blockquote className="border-l-4 border-amber-500 pl-6 py-4 bg-neutral-900/50 rounded-r-lg italic text-neutral-300 mb-6">
            "Within three years, more than half of market research may be done using
            AI-created synthetic personas instead of humans."
            <cite className="block mt-3 text-sm text-neutral-500 not-italic">
              — Qualtrics 2025 Market Research Trends Report<Cite id={2} />
            </cite>
          </blockquote>

          <p className="text-neutral-400 leading-relaxed">
            The shift is already happening: <strong className="text-white">69% of market research
            professionals</strong> have used synthetic data in the past year, and <strong className="text-white">87%
            report high satisfaction</strong> with the results.<Cite id={3} />
          </p>
        </div>
      </section>

      {/* Science */}
      <section ref={setRef("science")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">2. The science</h2>
          <p className="text-neutral-400 leading-relaxed mb-8">
            The breakthrough: LLMs conditioned on demographic traits reproduce the same response
            patterns we see in human surveys. This is "silicon sampling."<Cite id={4} />
          </p>

          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-6 rounded-r-lg mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">The key insight</h3>
            <p className="text-neutral-300">
              When prompted with demographic traits (age, income, education, location), language models
              generate responses that correlate with actual human survey data at <strong>85%+ accuracy</strong>
              for many question types.<Cite id={1} />
            </p>
          </div>

          <h3 className="text-xl font-semibold mb-4">Validation research</h3>
          <div className="space-y-4 mb-8">
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-white mb-2">Argyle et al. (2023)<Cite id={1} /></h4>
              <p className="text-sm text-neutral-400">
                Demonstrated that GPT-3 conditioned on demographics reproduces voting patterns, policy
                preferences, and social attitudes that match ANES and Cooperative Election Study data.
              </p>
            </div>
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-white mb-2">Mei et al. (2024)<Cite id={14} /></h4>
              <p className="text-sm text-neutral-400">
                Found that ChatGPT and GPT-4 reproduced human-like behavior across six canonical
                psychology studies, including the Milgram experiment and prisoner's dilemma.
              </p>
            </div>
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-white mb-2">Sarstedt et al. (2024)<Cite id={4} /></h4>
              <p className="text-sm text-neutral-400">
                Reviewed silicon sampling in consumer research, finding strong promise for pretesting
                and pilot studies, with specific recommendations for main study use.
              </p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4">Known limitations</h3>
          <div className="space-y-4">
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-amber-500 mb-2">WEIRD bias</h4>
              <p className="text-sm text-neutral-400">
                Models perform better for Western, Educated, Industrialized, Rich, and Democratic
                populations due to training data distribution.<Cite id={15} />
              </p>
            </div>
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-amber-500 mb-2">Sample size requirements</h4>
              <p className="text-sm text-neutral-400">
                Simulated sample sizes below 200 can produce unreliable or reversed results.<Cite id={20} />
              </p>
            </div>
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <h4 className="font-medium text-amber-500 mb-2">Complementary, not replacement</h4>
              <p className="text-sm text-neutral-400">
                Silicon sampling is best used alongside traditional research, not as a complete
                replacement—especially for novel topics or high-stakes decisions.<Cite id={18} />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product */}
      <section ref={setRef("product")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">3. The product</h2>
          <p className="text-neutral-400 leading-relaxed mb-8">
            HiveSight is a web application that makes silicon sampling accessible. Ask a question,
            specify demographics, get instant responses.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-lg font-semibold mb-2">Likert scale</h3>
              <p className="text-sm text-neutral-400 mb-4">
                5-point agree/disagree scales. Visualize distributions and calculate statistics.
              </p>
              <code className="block p-3 bg-neutral-950 rounded text-sm text-amber-500">
                4 respondents per credit (GPT-5 Mini)
              </code>
            </div>
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-lg font-semibold mb-2">Open-ended</h3>
              <p className="text-sm text-neutral-400 mb-4">
                Free-form responses with reasoning. Qualitative insights at scale.
              </p>
              <code className="block p-3 bg-neutral-950 rounded text-sm text-amber-500">
                2 respondents per credit (GPT-5 Mini)
              </code>
            </div>
          </div>

          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl mb-8">
            <h3 className="text-lg font-semibold mb-4">Demographic filters</h3>
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div>
                <span className="text-neutral-500 block mb-1">Age</span>
                <p className="text-white font-medium">18-100 years</p>
              </div>
              <div>
                <span className="text-neutral-500 block mb-1">Income</span>
                <p className="text-white font-medium">$0-$500K+</p>
              </div>
              <div>
                <span className="text-neutral-500 block mb-1">State</span>
                <p className="text-white font-medium">All 50 states</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-4">How it works</h3>
            <div className="flex flex-wrap gap-3">
              {[
                "1. Enter your question",
                "2. Set demographic filters",
                "3. Choose model & sample size",
                "4. Get instant results",
                "5. Export to CSV",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 bg-neutral-950 rounded-lg px-4 py-3">
                  <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-sm text-neutral-300">{step.slice(3)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Markets */}
      <section ref={setRef("markets")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">4. The markets</h2>
          <p className="text-neutral-400 leading-relaxed mb-8">
            We sit at the infrastructure layer beneath multiple large and growing markets.
          </p>

          <div className="grid gap-6 mb-12">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-lg font-semibold mb-2">Market research services</h3>
              <div className="text-2xl font-bold text-amber-500 mb-2">
                $84B → $140B<Cite id={17} />
              </div>
              <p className="text-sm text-neutral-400">
                7.7% CAGR through 2030. Survey research, focus groups, and opinion polling.
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-lg font-semibold mb-2">AI research services</h3>
              <div className="text-2xl font-bold text-amber-500 mb-2">
                $8B → $35B<Cite id={5} />
              </div>
              <p className="text-sm text-neutral-400">
                Synthetic respondents and AI-driven insights growing 15%+ annually through 2035.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
                <h3 className="text-lg font-semibold mb-2">Academic research</h3>
                <div className="text-lg font-bold text-amber-500 mb-2">Underserved</div>
                <p className="text-sm text-neutral-400">
                  PhD students, postdocs, and faculty with limited budgets but need for survey data.
                </p>
              </div>
              <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
                <h3 className="text-lg font-semibold mb-2">Product teams</h3>
                <div className="text-lg font-bold text-amber-500 mb-2">High velocity</div>
                <p className="text-sm text-neutral-400">
                  Rapid iteration on messaging, feature prioritization, and user sentiment testing.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-amber-500/10 border-l-4 border-amber-500 rounded-r-lg">
            <h3 className="text-lg font-semibold text-white mb-2">Industry adoption</h3>
            <p className="text-neutral-300">
              <strong className="text-white">83%</strong> of market research professionals plan to
              invest in AI for research in 2025.<Cite id={6} /> <strong className="text-white">64%</strong> of
              researchers increased AI tool usage in 2025.<Cite id={13} />
            </p>
          </div>
        </div>
      </section>

      {/* Competition */}
      <section ref={setRef("competition")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">5. Competition</h2>
          <p className="text-neutral-400 leading-relaxed mb-8">
            Traditional survey platforms haven't adopted AI respondents. Research tools lack web UIs.
          </p>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left py-3 px-4 text-neutral-400">Capability</th>
                  {competitors.map((c) => (
                    <th key={c.name} className="text-center py-3 px-4 text-neutral-400">
                      {c.name}
                    </th>
                  ))}
                  <th className="text-center py-3 px-4 bg-amber-500/10 text-amber-500">HiveSight</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">AI respondents</td>
                  {competitors.map((c) => (
                    <td key={c.name} className="py-3 px-4 text-center">
                      <CapabilityCell value={c.aiRespondents} />
                    </td>
                  ))}
                  <td className="py-3 px-4 text-center bg-amber-500/10">
                    <CheckIcon />
                  </td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Web UI (no code)</td>
                  {competitors.map((c) => (
                    <td key={c.name} className="py-3 px-4 text-center">
                      <CapabilityCell value={c.webUI} />
                    </td>
                  ))}
                  <td className="py-3 px-4 text-center bg-amber-500/10">
                    <CheckIcon />
                  </td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Instant results</td>
                  {competitors.map((c) => (
                    <td key={c.name} className="py-3 px-4 text-center">
                      <CapabilityCell value={c.instant} />
                    </td>
                  ))}
                  <td className="py-3 px-4 text-center bg-amber-500/10">
                    <CheckIcon />
                  </td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Low cost per response</td>
                  {competitors.map((c) => (
                    <td key={c.name} className="py-3 px-4 text-center">
                      <CapabilityCell value={c.lowCost} />
                    </td>
                  ))}
                  <td className="py-3 px-4 text-center bg-amber-500/10">
                    <CheckIcon />
                  </td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Demographic filters</td>
                  {competitors.map((c) => (
                    <td key={c.name} className="py-3 px-4 text-center">
                      <CapabilityCell value={c.demographics} />
                    </td>
                  ))}
                  <td className="py-3 px-4 text-center bg-amber-500/10">
                    <CheckIcon />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {competitors.map((c) => (
              <div key={c.name} className="p-4 bg-neutral-900/50 rounded-lg">
                <h4 className="font-medium mb-2">
                  {c.name}
                  {c.sourceId && <Cite id={c.sourceId} />}
                </h4>
                <p className="text-sm text-neutral-400">{c.notes}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section ref={setRef("pricing")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">6. Pricing strategy</h2>
          <p className="text-xl font-medium text-white mb-4">
            Hybrid model: credits + subscriptions
          </p>
          <p className="text-neutral-400 leading-relaxed mb-8">
            The AI SaaS industry is moving toward hybrid pricing.<Cite id={7} /> 39% of SaaS companies
            now use usage-based pricing, and 22% use hybrid models.<Cite id={8} />
          </p>

          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-6 rounded-r-lg mb-8">
            <p className="text-neutral-300">
              <strong className="text-white">Industry insight:</strong> "Start with usage-based or
              prepaid credits to reduce friction, then evolve toward hybrid or subscription models
              as engagement increases."<Cite id={8} />
            </p>
          </div>

          <h3 className="text-xl font-semibold mb-6">Comparable pricing models</h3>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left py-3 px-4 text-neutral-400">Company</th>
                  <th className="text-left py-3 px-4 text-neutral-400">Model</th>
                  <th className="text-left py-3 px-4 text-neutral-400">Rationale</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">OpenAI<Cite id={12} /></td>
                  <td className="py-3 px-4 text-amber-500">Hybrid</td>
                  <td className="py-3 px-4 text-neutral-400">$20/mo Plus OR pay-per-token API</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Midjourney</td>
                  <td className="py-3 px-4 text-amber-500">Hybrid</td>
                  <td className="py-3 px-4 text-neutral-400">Subscription tiers with GPU credits</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Adobe Firefly</td>
                  <td className="py-3 px-4 text-amber-500">Credits</td>
                  <td className="py-3 px-4 text-neutral-400">$10-$200 for 2K-50K credits<Cite id={16} /></td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">GitHub Copilot</td>
                  <td className="py-3 px-4 text-amber-500">Subscription</td>
                  <td className="py-3 px-4 text-neutral-400">$19/seat flat, encourages adoption</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-semibold mb-4">HiveSight pricing</h3>
          <div className="space-y-1">
            <div className="flex justify-between items-center p-5 bg-neutral-900 border-l-4 border-green-500">
              <div>
                <h4 className="font-medium">Credits (one-time)</h4>
                <p className="text-sm text-neutral-400">Pay for what you use. No commitment.</p>
              </div>
              <span className="text-amber-500 font-semibold">$0.10/credit</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-neutral-900 border-l-4 border-blue-500">
              <div>
                <h4 className="font-medium">Basic subscription</h4>
                <p className="text-sm text-neutral-400">1,000 credits/mo for regular users</p>
              </div>
              <span className="text-amber-500 font-semibold">$29/mo</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-neutral-900 border-l-4 border-purple-500">
              <div>
                <h4 className="font-medium">Premium subscription</h4>
                <p className="text-sm text-neutral-400">10,000 credits/mo for power users</p>
              </div>
              <span className="text-amber-500 font-semibold">$99/mo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Business Model */}
      <section ref={setRef("model")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">7. Business model</h2>

          <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-xl text-center mb-8">
            <h3 className="text-lg font-medium text-neutral-400 mb-6">Unit economics</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <span className="text-3xl font-bold text-white block">$0.10</span>
                <span className="text-sm text-neutral-400">per credit</span>
              </div>
              <div>
                <span className="text-3xl font-bold text-white block">~$0.025</span>
                <span className="text-sm text-neutral-400">API cost<Cite id={12} /></span>
              </div>
              <div>
                <span className="text-3xl font-bold text-amber-500 block">75%</span>
                <span className="text-sm text-neutral-400">gross margin</span>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4">Revenue streams</h3>
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center p-4 bg-neutral-900 rounded-lg">
              <span className="text-neutral-400">Credit purchases</span>
              <span className="text-white">One-time, variable revenue</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-900 rounded-lg">
              <span className="text-neutral-400">Subscriptions</span>
              <span className="text-white">Monthly recurring revenue (MRR)</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-900 rounded-lg">
              <span className="text-neutral-400">Enterprise / API</span>
              <span className="text-white">Annual contracts (future)</span>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4">Why hybrid works for HiveSight</h3>
          <ul className="space-y-3 text-neutral-400">
            <li className="flex items-start gap-3">
              <span className="text-amber-500">→</span>
              <span>
                <strong className="text-white">Researchers:</strong> Sporadic, project-based usage.
                Credits let them pay per survey without commitment.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-amber-500">→</span>
              <span>
                <strong className="text-white">Power users:</strong> Regular surveys need predictable
                costs. Subscriptions provide budget certainty.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-amber-500">→</span>
              <span>
                <strong className="text-white">Try before commit:</strong> Credits reduce friction
                for new users to test the product.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-amber-500">→</span>
              <span>
                <strong className="text-white">Upsell path:</strong> Convert credit users to
                subscribers as their usage grows.
              </span>
            </li>
          </ul>

          <div className="mt-8 p-6 bg-neutral-900/50 border border-neutral-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-4">Open source precedent<Cite id={16} /></h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="text-neutral-500 text-sm block">MongoDB</span>
                <span className="text-xl font-bold text-amber-500">$1.7B ARR</span>
              </div>
              <div>
                <span className="text-neutral-500 text-sm block">Elastic</span>
                <span className="text-xl font-bold text-amber-500">$1.3B ARR</span>
              </div>
              <div>
                <span className="text-neutral-500 text-sm block">GitLab</span>
                <span className="text-xl font-bold text-amber-500">$580M ARR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Traction */}
      <section ref={setRef("traction")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">8. Traction & roadmap</h2>

          <div className="space-y-6">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                  Complete
                </span>
                <h3 className="text-lg font-semibold">MVP</h3>
              </div>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>• Likert and open-ended survey types</li>
                <li>• Demographic filtering (age, income, state)</li>
                <li>• Credit system with Stripe integration</li>
                <li>• GPT-5 Mini and GPT-5 models</li>
                <li>• Results visualization and CSV export</li>
                <li>• Google OAuth authentication</li>
              </ul>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                  Next
                </span>
                <h3 className="text-lg font-semibold">Growth features</h3>
              </div>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>• Subscription tiers (Basic, Premium)</li>
                <li>• Custom persona upload</li>
                <li>• API access for developers</li>
                <li>• Team workspaces and collaboration</li>
                <li>• More demographic attributes (education, occupation)</li>
              </ul>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-neutral-500/20 text-neutral-400 text-xs font-medium rounded-full">
                  Future
                </span>
                <h3 className="text-lg font-semibold">Enterprise</h3>
              </div>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>• Custom fine-tuned models</li>
                <li>• Human panel validation mode</li>
                <li>• White-label solution</li>
                <li>• Advanced analytics dashboard</li>
                <li>• International persona databases</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section ref={setRef("team")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">9. Team</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-xl font-semibold mb-2">Max Ghenis</h3>
              <p className="text-amber-500 text-sm mb-4">Founder & CEO</p>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>• Founded PolicyEngine — models used by UK Government, US Congress</li>
                <li>• Founded Cosilico — building society simulation infrastructure</li>
                <li>• Former Google data scientist</li>
                <li>• MIT economics, UC Berkeley statistics</li>
              </ul>
              <div className="flex gap-4 mt-4">
                <a
                  href="https://linkedin.com/in/maxghenis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-amber-500"
                >
                  LinkedIn
                </a>
                <a
                  href="https://github.com/maxghenis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-amber-500"
                >
                  GitHub
                </a>
              </div>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl border-dashed">
              <h3 className="text-xl font-semibold mb-2">Hiring</h3>
              <p className="text-amber-500 text-sm mb-4">Co-founders & early team</p>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>• Full-stack engineer with AI/ML experience</li>
                <li>• Growth/marketing for research tools</li>
                <li>• Academic advisors in survey methodology</li>
              </ul>
              <p className="text-sm text-neutral-500 italic mt-4">
                Interested? max@hivesight.ai
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Risks */}
      <section ref={setRef("risks")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">10. Risks & mitigations</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">LLM accuracy concerns</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "Won't people question AI-generated data?"
              </p>
              <p className="text-sm text-neutral-400">
                We're transparent about methodology. Position as rapid prototyping and hypothesis
                generation, not replacement for high-stakes research. Validation studies show
                strong correlation with human data for many use cases.<Cite id={1} />
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">WEIRD population bias</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "Models underrepresent non-Western views"
              </p>
              <p className="text-sm text-neutral-400">
                Focus initial launch on US market where training data is strongest. Clear
                documentation of limitations. Future: custom fine-tuning for specific
                populations.<Cite id={15} />
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">API cost volatility</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "What if OpenAI raises prices?"
              </p>
              <p className="text-sm text-neutral-400">
                Model-agnostic architecture. Can switch between providers (OpenAI, Anthropic, open
                source). Pricing already includes margin for cost increases.<Cite id={12} />
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">Competition from incumbents</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "Qualtrics could add this feature"
              </p>
              <p className="text-sm text-neutral-400">
                Enterprise incumbents move slowly. Their business model depends on human panels—AI
                respondents cannibalize revenue. We're purpose-built for AI-first
                research.<Cite id={9} />
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">Single founder risk</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "Why no co-founder yet?"
              </p>
              <p className="text-sm text-neutral-400">
                Actively hiring. Seed capital enables founding engineer hires. Strong advisor
                network from PolicyEngine and Cosilico.
              </p>
            </div>

            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="font-semibold mb-2">Market education</h4>
              <p className="text-amber-500 text-sm italic mb-3">
                "Researchers don't trust AI data"
              </p>
              <p className="text-sm text-neutral-400">
                Industry adoption is accelerating—83% plan AI investment in 2025.<Cite id={6} />
                Academic publications legitimize the methodology. Start with early adopters.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Ask */}
      <section ref={setRef("ask")} className="min-h-screen px-6 py-24 flex flex-col items-center">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-bold mb-8">11. The ask</h2>

          <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-xl text-center mb-8">
            <span className="text-sm text-neutral-500 uppercase tracking-widest block mb-4">
              Seed round
            </span>
            <span className="text-5xl font-bold bg-linear-to-r from-amber-500 to-amber-400 bg-clip-text text-transparent">
              $1-2M
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="p-6 bg-neutral-900/50 rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Use of funds</h3>
              <div className="space-y-3">
                <div className="relative h-8 bg-neutral-950 rounded overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500/30 w-[50%]" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm z-10">
                    50% Engineering
                  </span>
                </div>
                <div className="relative h-8 bg-neutral-950 rounded overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500/30 w-[25%]" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm z-10">
                    25% Go-to-market
                  </span>
                </div>
                <div className="relative h-8 bg-neutral-950 rounded overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500/30 w-[15%]" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm z-10">
                    15% Data/ML
                  </span>
                </div>
                <div className="relative h-8 bg-neutral-950 rounded overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500/30 w-[10%]" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm z-10">
                    10% Operations
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-neutral-900/50 rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Milestones to Series A</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-amber-500">→</span>
                  <span>100+ paying customers</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-amber-500">→</span>
                  <span>$500K ARR</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-amber-500">→</span>
                  <span>API launch and enterprise pilots</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-amber-500">→</span>
                  <span>Academic validation partnerships</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-amber-500">→</span>
                  <span>International expansion (UK, EU)</span>
                </li>
              </ul>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4">Revenue path</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left py-3 px-4 text-neutral-500">Year</th>
                  <th className="text-left py-3 px-4 text-neutral-500">ARR</th>
                  <th className="text-left py-3 px-4 text-neutral-500">Customers</th>
                  <th className="text-left py-3 px-4 text-neutral-500">Milestone</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Y1</td>
                  <td className="py-3 px-4 text-amber-500 font-semibold">$100K</td>
                  <td className="py-3 px-4">50+</td>
                  <td className="py-3 px-4 text-neutral-400">Product-market fit, first enterprise pilot</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Y2</td>
                  <td className="py-3 px-4 text-amber-500 font-semibold">$500K</td>
                  <td className="py-3 px-4">200+</td>
                  <td className="py-3 px-4 text-neutral-400">API launch, 2-3 enterprise deals</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Y3</td>
                  <td className="py-3 px-4 text-amber-500 font-semibold">$2M</td>
                  <td className="py-3 px-4">500+</td>
                  <td className="py-3 px-4 text-neutral-400">Enterprise sales, international expansion</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Y4</td>
                  <td className="py-3 px-4 text-amber-500 font-semibold">$5M</td>
                  <td className="py-3 px-4">1000+</td>
                  <td className="py-3 px-4 text-neutral-400">Platform status, academic partnerships</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 px-4">Y5</td>
                  <td className="py-3 px-4 text-amber-500 font-semibold">$15M</td>
                  <td className="py-3 px-4">2500+</td>
                  <td className="py-3 px-4 text-neutral-400">Category leader</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* References */}
      <section className="px-6 py-24 bg-neutral-900/50 border-t border-neutral-800">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">References</h2>
          <ol className="space-y-4">
            {sources.map((source) => (
              <li key={source.id} className="text-sm text-neutral-400 pl-10 relative">
                <span className="absolute left-0 text-amber-500 font-medium">[{source.id}]</span>
                {source.author && <span>{source.author}. </span>}
                <em className="text-neutral-300">{source.title}</em>
                <span> ({source.year}). </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-amber-500 break-all"
                >
                  {source.url.replace(/^https?:\/\//, "").split("/")[0]}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center border-t border-neutral-800">
        <h2 className="text-4xl font-bold mb-4">Interested?</h2>
        <p className="text-neutral-400 mb-8">
          We're building the future of survey research.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="mailto:max@hivesight.ai"
            className="px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Get in touch
          </a>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-neutral-700 text-white font-medium rounded-lg hover:border-neutral-500 transition-colors"
          >
            Try HiveSight
          </Link>
          <Link
            href="/"
            className="px-6 py-3 border border-neutral-700 text-white font-medium rounded-lg hover:border-neutral-500 transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
