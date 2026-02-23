import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Check, X, MessageSquare, FileText, Hexagon } from "lucide-react";

export const metadata = {
  title: "Writing guide - HiveSight Brand",
  description: "HiveSight writing style: voice, tone, and content guidelines",
};

function Example({
  good,
  bad,
  context,
}: {
  good: string;
  bad: string;
  context?: string;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
        <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
            Do
          </p>
          <p className="text-sm">{good}</p>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
        <X className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            Don&apos;t
          </p>
          <p className="text-sm">{bad}</p>
        </div>
      </div>
      {context && (
        <p className="md:col-span-2 text-sm text-muted-foreground italic">
          {context}
        </p>
      )}
    </div>
  );
}

export default function WritingPage() {
  return (
    <main className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <Link
          href="/brand"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to brand
        </Link>

        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Writing guide
          </h1>
          <p className="text-xl text-muted-foreground">
            How we communicate about HiveSight. Our voice is knowledgeable but
            accessible, confident but honest about limitations.
          </p>
        </div>

        {/* Voice principles */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Voice principles</h2>
          <p className="text-muted-foreground mb-6">
            These principles guide all HiveSight communications.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Clear</CardTitle>
                <CardDescription>
                  Explain complex AI concepts simply
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Avoid jargon. If you must use technical terms, define them.
                Assume readers are intelligent but not experts in AI or survey
                methodology.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Honest</CardTitle>
                <CardDescription>
                  Be upfront about what AI can and cannot do
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Never overstate capabilities. Always clarify that responses are
                simulated. Acknowledge limitations proactively.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Helpful</CardTitle>
                <CardDescription>
                  Guide users to successful outcomes
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Anticipate questions. Provide context. Offer suggestions when
                things go wrong. Make the path forward obvious.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Respectful</CardTitle>
                <CardDescription>
                  Value the user&apos;s time and intelligence
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Be concise. Don&apos;t explain what&apos;s obvious. Avoid
                condescension. Trust that users can handle nuance.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Sentence case */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Sentence case for headings</h2>
          <p className="text-muted-foreground mb-6">
            We use sentence case for all headings. This means capitalizing only
            the first word and proper nouns.
          </p>

          <div className="space-y-6">
            <Example
              good="How it works"
              bad="How It Works"
              context="Standard heading"
            />
            <Example
              good="Simulating American opinions"
              bad="Simulating American Opinions"
              context="'American' is capitalized because it's a proper noun"
            />
            <Example
              good="Results from GPT-4o"
              bad="Results From GPT-4o"
              context="Product names keep their original capitalization"
            />
          </div>

          <div className="mt-6 p-4 bg-amber-500/10 rounded-lg">
            <p className="text-sm">
              <strong>Why sentence case?</strong> It&apos;s more readable, feels
              more conversational, and follows modern design conventions used by
              Apple, Google, Notion, and most contemporary products.
            </p>
          </div>
        </section>

        {/* Active voice */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Active voice</h2>
          <p className="text-muted-foreground mb-6">
            Use active voice whenever possible. It&apos;s more direct and easier
            to understand.
          </p>

          <div className="space-y-6">
            <Example
              good="HiveSight generates 500 responses in under a minute."
              bad="500 responses are generated by HiveSight in under a minute."
            />
            <Example
              good="We simulate how people would respond to your question."
              bad="The responses to your question are simulated by our system."
            />
            <Example
              good="Enter your question in the text field."
              bad="Your question should be entered in the text field."
            />
          </div>
        </section>

        {/* AI terminology */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">AI terminology</h2>
          <p className="text-muted-foreground mb-6">
            How we talk about AI-generated content. Always be clear that
            responses are simulated.
          </p>

          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-4">Preferred terms</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-1">Simulated responses</p>
                  <p className="text-sm text-muted-foreground">
                    Primary term. Clear that it&apos;s not real humans.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-1">AI-generated perspectives</p>
                  <p className="text-sm text-muted-foreground">
                    Alternative. Emphasizes diversity of viewpoints.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-1">Synthetic respondents</p>
                  <p className="text-sm text-muted-foreground">
                    Industry term. Use in technical contexts.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-1">Simulated opinions</p>
                  <p className="text-sm text-muted-foreground">
                    For survey results. Clear it&apos;s an approximation.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Terms to avoid</h3>
              <div className="space-y-4">
                <Example
                  good="Simulated responses from AI personas"
                  bad="Real opinions from virtual people"
                  context="Don't blur the line between simulated and real"
                />
                <Example
                  good="This survey uses AI to simulate how people might respond"
                  bad="This survey asks AI people your question"
                  context="Don't personify AI as 'people'"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Survey terminology */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Survey and research terms</h2>
          <p className="text-muted-foreground mb-6">
            Use standard research terminology accurately to build credibility
            with researchers.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-1">Sample size</p>
              <p className="text-sm text-muted-foreground">
                Number of simulated respondents. Use this term, not
                &quot;number of responses.&quot;
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-1">Likert scale</p>
              <p className="text-sm text-muted-foreground">
                5-point agree/disagree scale. Standard research terminology.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-1">Demographic filters</p>
              <p className="text-sm text-muted-foreground">
                Age, income, location constraints. Not &quot;targeting
                options.&quot;
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-1">Response distribution</p>
              <p className="text-sm text-muted-foreground">
                How responses are spread across options. Industry standard term.
              </p>
            </div>
          </div>
        </section>

        {/* Content types */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Content types</h2>
          <p className="text-muted-foreground mb-6">
            Guidelines for specific content formats.
          </p>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-lg">UI text</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    <strong>Buttons:</strong> Use action verbs. &quot;Run
                    survey&quot; not &quot;Submit.&quot;
                  </li>
                  <li>
                    <strong>Labels:</strong> Be descriptive. &quot;Sample
                    size&quot; not &quot;N.&quot;
                  </li>
                  <li>
                    <strong>Placeholders:</strong> Show format examples.
                    &quot;Enter your question...&quot;
                  </li>
                  <li>
                    <strong>Errors:</strong> Explain what went wrong and how to
                    fix it.
                  </li>
                  <li>
                    <strong>Confirmations:</strong> Be specific. &quot;Survey
                    completed. 500 responses collected.&quot;
                  </li>
                </ul>
                <Example
                  good="Running survey... This typically takes 30-60 seconds."
                  bad="Please wait..."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-lg">Help and documentation</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    <strong>Lead with the outcome:</strong> What will users be
                    able to do?
                  </li>
                  <li>
                    <strong>Use numbered steps:</strong> For procedural content.
                  </li>
                  <li>
                    <strong>Include examples:</strong> Show, don&apos;t just
                    tell.
                  </li>
                  <li>
                    <strong>Link to related topics:</strong> Anticipate next
                    questions.
                  </li>
                </ul>
                <Example
                  good="To target specific demographics: 1. Click 'Filters' 2. Select age range 3. Choose income bracket"
                  bad="You can filter demographics by using the filtering functionality in the filter panel."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
                  <CardTitle className="text-lg">Marketing copy</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    <strong>Lead with benefits:</strong> What problems do we
                    solve?
                  </li>
                  <li>
                    <strong>Be specific:</strong> &quot;500 responses in 60
                    seconds&quot; not &quot;fast results.&quot;
                  </li>
                  <li>
                    <strong>Include social proof:</strong> Research
                    validations, user testimonials.
                  </li>
                  <li>
                    <strong>End with action:</strong> Clear next step.
                  </li>
                </ul>
                <Example
                  good="Get 500 simulated survey responses in under a minute. HiveSight uses AI to model how diverse Americans would respond to your questions."
                  bad="HiveSight is an innovative AI-powered survey platform that leverages cutting-edge language models to generate synthetic responses."
                />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Disclaimers */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Required disclaimers</h2>
          <p className="text-muted-foreground mb-6">
            Always include appropriate disclaimers about AI limitations.
          </p>

          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-2">Survey results</p>
              <p className="text-sm text-muted-foreground italic">
                &quot;These results are AI-simulated and may not reflect actual
                human opinions. Simulations are based on demographic patterns
                observed in training data.&quot;
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-2">Export/download</p>
              <p className="text-sm text-muted-foreground italic">
                &quot;Data generated by HiveSight represents simulated
                responses, not surveys of real individuals.&quot;
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium mb-2">General usage</p>
              <p className="text-sm text-muted-foreground italic">
                &quot;HiveSight is best used for rapid prototyping, hypothesis
                generation, and exploratory research. For high-stakes decisions,
                validate with human respondents.&quot;
              </p>
            </div>
          </div>
        </section>

        {/* Tone variations */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Tone by context</h2>
          <p className="text-muted-foreground mb-6">
            Adjust tone based on the situation while maintaining our core voice.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Context</th>
                  <th className="text-left py-3 px-4 font-semibold">Tone</th>
                  <th className="text-left py-3 px-4 font-semibold">Example</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4">Onboarding</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Warm, encouraging
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    &quot;Welcome! Let&apos;s run your first survey.&quot;
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Error states</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Calm, solution-focused
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    &quot;We couldn&apos;t process that. Try reducing sample
                    size.&quot;
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Success states</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Confident, factual
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    &quot;Survey complete. 500 responses collected in 47
                    seconds.&quot;
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Limitations</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Direct, honest
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    &quot;AI responses work best for common demographics.&quot;
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Pricing</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Transparent, fair
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    &quot;This survey will use 50 credits (~$5).&quot;
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Checklist */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Writing checklist</h2>
          <p className="text-muted-foreground mb-6">
            Before publishing, verify your content against these standards.
          </p>

          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {[
                  "Uses sentence case for headings",
                  "Written in active voice",
                  "Explains AI concepts without jargon",
                  "Clarifies that responses are simulated, not real",
                  "Includes appropriate disclaimers",
                  "Uses correct research terminology",
                  "Provides specific examples where helpful",
                  "Respects the reader's time (concise)",
                  "Ends with a clear next step (if applicable)",
                  "Proofread for spelling and grammar",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded border-2 border-muted-foreground/30 shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
