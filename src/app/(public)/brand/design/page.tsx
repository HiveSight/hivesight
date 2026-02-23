import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Hexagon, Check, X, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Design system - HiveSight brand",
  description: "HiveSight design system: colors, typography, spacing, and components",
};

function ColorSwatch({
  name,
  value,
  textColor = "text-white",
  description,
}: {
  name: string;
  value: string;
  textColor?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <div
        className={`h-24 rounded-lg flex items-end p-3 ${value} ${textColor}`}
      >
        <span className="text-sm font-medium">{name}</span>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function SpacingExample({ size, pixels }: { size: string; pixels: number }) {
  return (
    <div className="flex items-center gap-4">
      <code className="text-sm min-w-[60px]">{size}</code>
      <div
        className="bg-amber-500/30 h-4"
        style={{ width: `${pixels}px` }}
      />
      <span className="text-sm text-muted-foreground">{pixels}px</span>
    </div>
  );
}

export default function DesignPage() {
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
            Design system
          </h1>
          <p className="text-xl text-muted-foreground">
            Visual foundations for building consistent HiveSight experiences.
            Our design reflects the precision of data with the warmth of
            collective intelligence.
          </p>
        </div>

        {/* Colors */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Colors</h2>
          <p className="text-muted-foreground mb-6">
            Our palette centers on honey amber - evoking the hive - balanced
            with neutral grays for professionalism and clarity.
          </p>

          <h3 className="text-lg font-semibold mb-4">Primary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <ColorSwatch
              name="amber-500"
              value="bg-amber-500"
              description="Primary brand color. Use for CTAs, highlights, and key UI elements."
            />
            <ColorSwatch
              name="amber-600"
              value="bg-amber-600"
              description="Hover state for primary elements."
            />
            <ColorSwatch
              name="amber-400"
              value="bg-amber-400"
              description="Light accent, use sparingly."
            />
            <ColorSwatch
              name="amber-500/20"
              value="bg-amber-500/20"
              textColor="text-amber-700"
              description="Background tint for cards and highlights."
            />
          </div>

          <h3 className="text-lg font-semibold mb-4">Neutral</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <ColorSwatch name="neutral-950" value="bg-neutral-950" />
            <ColorSwatch name="neutral-900" value="bg-neutral-900" />
            <ColorSwatch name="neutral-500" value="bg-neutral-500" />
            <ColorSwatch
              name="neutral-200"
              value="bg-neutral-200"
              textColor="text-neutral-800"
            />
            <ColorSwatch
              name="white"
              value="bg-white border"
              textColor="text-neutral-800"
            />
          </div>

          <h3 className="text-lg font-semibold mb-4">Semantic</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ColorSwatch
              name="green-500"
              value="bg-green-500"
              description="Success states, positive metrics"
            />
            <ColorSwatch
              name="red-500"
              value="bg-red-500"
              description="Errors, destructive actions"
            />
            <ColorSwatch
              name="yellow-500"
              value="bg-yellow-500"
              textColor="text-yellow-900"
              description="Warnings, cautions"
            />
          </div>
        </section>

        {/* Typography */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Typography</h2>
          <p className="text-muted-foreground mb-6">
            We use the system font stack for optimal performance and
            familiarity. All headings use sentence case.
          </p>

          <div className="space-y-6 border rounded-xl p-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Display / text-4xl / 36px
              </p>
              <p className="text-4xl font-bold tracking-tight">
                Simulate public opinion
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Heading 1 / text-3xl / 30px
              </p>
              <p className="text-3xl font-bold">Survey results</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Heading 2 / text-2xl / 24px
              </p>
              <p className="text-2xl font-bold">Demographic breakdown</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Heading 3 / text-xl / 20px
              </p>
              <p className="text-xl font-semibold">Response distribution</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Body / text-base / 16px
              </p>
              <p>
                HiveSight uses AI to simulate how diverse Americans would
                respond to your questions. Get instant feedback from hundreds of
                perspectives.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Small / text-sm / 14px
              </p>
              <p className="text-sm text-muted-foreground">
                Results are simulated and may not reflect actual human opinions.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Code / font-mono
              </p>
              <code className="text-sm bg-muted px-2 py-1 rounded">
                gpt-4o-mini
              </code>
            </div>
          </div>

          <div className="mt-6 p-4 bg-amber-500/10 rounded-lg">
            <p className="text-sm">
              <strong>Sentence case for headings:</strong> We capitalize only
              the first word and proper nouns. This is more readable and
              follows modern design conventions.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>How it works</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="h-4 w-4 text-red-500" />
                <span>How It Works</span>
              </div>
            </div>
          </div>
        </section>

        {/* Spacing */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Spacing</h2>
          <p className="text-muted-foreground mb-6">
            We use Tailwind&apos;s default spacing scale based on 4px
            increments.
          </p>

          <div className="border rounded-xl p-6 space-y-3">
            <SpacingExample size="1" pixels={4} />
            <SpacingExample size="2" pixels={8} />
            <SpacingExample size="3" pixels={12} />
            <SpacingExample size="4" pixels={16} />
            <SpacingExample size="6" pixels={24} />
            <SpacingExample size="8" pixels={32} />
            <SpacingExample size="12" pixels={48} />
            <SpacingExample size="16" pixels={64} />
          </div>
        </section>

        {/* Components */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Components</h2>
          <p className="text-muted-foreground mb-6">
            Built on shadcn/ui with custom amber theming. These are the core
            building blocks.
          </p>

          <div className="space-y-8">
            {/* Buttons */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Buttons</h3>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap gap-4 mb-4">
                    <Button>Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cards */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Cards</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Default card</CardTitle>
                    <CardDescription>
                      Standard card for content grouping
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Cards provide visual separation and hierarchy.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle>Highlighted card</CardTitle>
                    <CardDescription>
                      Use amber border for emphasis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Draw attention to important information.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Inputs */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Inputs</h3>
              <Card>
                <CardContent className="pt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Default input
                      </label>
                      <Input placeholder="Enter your question..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Disabled input
                      </label>
                      <Input placeholder="Disabled" disabled />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alerts */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Alerts and notices</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Hexagon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Information
                    </p>
                    <p className="text-sm text-muted-foreground">
                      AI-generated responses are simulations based on
                      demographic patterns.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      Success
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Survey completed successfully. 500 responses collected.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <X className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-400">
                      Error
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Failed to process survey. Please try again.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      Warning
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Low credit balance. Add credits to continue running
                      surveys.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Iconography */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Iconography</h2>
          <p className="text-muted-foreground mb-6">
            We use Lucide Icons for consistency. The hexagon is our brand icon,
            representing the hive.
          </p>

          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 md:grid-cols-8 gap-6">
                {[
                  { icon: Hexagon, name: "Brand icon", fill: true },
                ].map(({ icon: Icon, name, fill }) => (
                  <div
                    key={name}
                    className="flex flex-col items-center gap-2 text-center"
                  >
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <Icon
                        className={`h-6 w-6 text-amber-500 ${fill ? "fill-amber-500/20" : ""}`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Use 20-24px icons for UI elements. The hexagon icon should
                always include the{" "}
                <code className="bg-muted px-1 rounded">fill-amber-500/20</code>{" "}
                treatment.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Patterns */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Visual patterns</h2>
          <p className="text-muted-foreground mb-6">
            Subtle honeycomb and hexagonal patterns can be used as background
            textures.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div
                  className="h-32 rounded-lg bg-amber-500/5 flex items-center justify-center"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='49' viewBox='0 0 28 49' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f59e0b' fill-opacity='0.1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  }}
                >
                  <span className="text-sm text-muted-foreground">
                    Honeycomb pattern
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Use for hero sections or marketing pages
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="h-32 rounded-lg bg-linear-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">
                    Gradient overlay
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Subtle amber gradient for card highlights
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Best practices */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Best practices</h2>
          <p className="text-muted-foreground mb-6">
            Guidelines for maintaining visual consistency.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Do
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Use amber-500 as the primary accent color</li>
                <li>Maintain generous whitespace</li>
                <li>Use sentence case for all headings</li>
                <li>Include the hexagon icon with amber fill treatment</li>
                <li>Use semantic colors for status indicators</li>
                <li>Keep UI clean and focused</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <X className="h-5 w-5 text-red-500" />
                Don&apos;t
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Use competing accent colors</li>
                <li>Crowd elements without proper spacing</li>
                <li>Use Title Case For Headings</li>
                <li>Use the hexagon without the fill treatment</li>
                <li>Mix icon styles (stick to Lucide)</li>
                <li>Over-decorate with patterns</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
