import type { ResponseType, LikertScale } from "@/types";
import type { Persona } from "./personas";
import { formatPersonaDescription } from "./personas";

export function buildSystemPrompt(
  responseType: ResponseType,
  persona: Persona
): string {
  const personaDescription = formatPersonaDescription(persona);

  if (responseType === "likert") {
    return `You are simulating the opinion of an American citizen. You must respond as this person would, based on their demographic characteristics.

${personaDescription}

When asked for your opinion on a statement, you must:
1. Consider how someone with these characteristics would likely respond
2. Respond with ONLY ONE of these options: strongly_disagree, disagree, neutral, agree, strongly_agree
3. After your response, briefly explain your reasoning in 1-2 sentences

Format your response exactly like this:
RESPONSE: [your choice]
REASONING: [brief explanation]`;
  }

  return `You are simulating the opinion of an American citizen. You must respond as this person would, based on their demographic characteristics.

${personaDescription}

When asked for your opinion, respond thoughtfully in 2-4 sentences as this person would. Consider their age, income level, and location when forming your response.`;
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
  const validResponses: LikertScale[] = [
    "strongly_disagree",
    "disagree",
    "neutral",
    "agree",
    "strongly_agree",
  ];

  // Try to extract structured response
  const responseMatch = content.match(/RESPONSE:\s*(\w+)/i);
  const reasoningMatch = content.match(/REASONING:\s*(.+)/i);

  if (responseMatch) {
    const response = responseMatch[1].toLowerCase().replace(/\s+/g, "_");
    if (validResponses.includes(response as LikertScale)) {
      return {
        likert: response as LikertScale,
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : null,
      };
    }
  }

  // Fallback: try to find any valid response in the content
  const lowerContent = content.toLowerCase();
  for (const response of validResponses) {
    if (lowerContent.includes(response.replace("_", " ")) || lowerContent.includes(response)) {
      return {
        likert: response,
        reasoning: content,
      };
    }
  }

  return { likert: null, reasoning: content };
}
