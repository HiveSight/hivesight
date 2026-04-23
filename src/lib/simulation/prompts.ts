import type { ResponseType, LikertScale } from "@/types";

export function buildSystemPrompt(
  responseType: ResponseType,
  personaDescription: string
): string {
  if (responseType === "likert") {
    return `You are simulating the opinion of an American citizen. You must respond as this person would, based on the profile details below.

${personaDescription}

When asked for your opinion on a statement, you must:
1. Consider how someone with this profile would likely respond
2. Respond with ONLY ONE of these options: strongly_disagree, disagree, neutral, agree, strongly_agree
3. After your response, briefly explain your reasoning in 1-2 sentences

Format your response exactly like this:
RESPONSE: [your choice]
REASONING: [brief explanation]`;
  }

  return `You are simulating the opinion of an American citizen. You must respond as this person would, based on the profile details below.

${personaDescription}

When asked for your opinion, respond thoughtfully in 2-4 sentences as this person would. Use the profile details that are relevant to the question instead of assuming facts that are not provided.`;
}

export function buildUserPrompt(
  question: string,
  responseType: ResponseType
): string {
  if (responseType === "likert") {
    return `Please indicate your level of agreement with the following statement:

"${question}"

Remember to respond with: strongly_disagree, disagree, neutral, agree, or strongly_agree, followed by your reasoning.`;
  }

  return `Please share your thoughts on the following:

"${question}"`;
}

export function parseLikertResponse(
  content: string
): { likert: LikertScale | null; reasoning: string | null } {
  const responsePatterns: Array<[LikertScale, RegExp]> = [
    ["strongly_disagree", /\bstrongly[\s_-]+disagree\b/i],
    ["strongly_agree", /\bstrongly[\s_-]+agree\b/i],
    ["disagree", /\bdisagree\b/i],
    ["neutral", /\bneutral\b/i],
    ["agree", /\bagree\b/i],
  ];

  const parseLikertLabel = (text: string): LikertScale | null => {
    for (const [response, pattern] of responsePatterns) {
      if (pattern.test(text)) {
        return response;
      }
    }
    return null;
  };

  const validResponses: LikertScale[] = [
    "strongly_disagree",
    "disagree",
    "neutral",
    "agree",
    "strongly_agree",
  ];

  // Try to extract structured response
  const responseMatch = content.match(/RESPONSE:\s*([^\n\r]+)/i);
  const reasoningMatch = content.match(/REASONING:\s*(.+)/i);

  if (responseMatch) {
    const response = parseLikertLabel(responseMatch[1]);
    if (response && validResponses.includes(response)) {
      return {
        likert: response,
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : null,
      };
    }
  }

  // Fallback: try to find any valid response in the content
  const response = parseLikertLabel(content);
  if (response) {
    return {
      likert: response,
      reasoning: content,
    };
  }

  return { likert: null, reasoning: content };
}
