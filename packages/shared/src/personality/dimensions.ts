export function compileVerbosity(value: number): string {
  if (value <= 20) return "Be extremely concise. Use bullet points. No preamble. One sentence per idea.";
  if (value <= 40) return "Be concise and direct. Brief explanations only when necessary. Prefer lists over paragraphs.";
  if (value <= 60) return "Balance conciseness with clarity. Explain reasoning when the decision isn't obvious.";
  if (value <= 80) return "Be thorough in explanations. Provide context and reasoning. Use examples when helpful.";
  return "Be comprehensive. Provide detailed analysis with supporting evidence, examples, and alternatives considered.";
}

export function compileTechnicality(value: number): string {
  if (value <= 20) return "Use plain language and analogies. Avoid jargon. Explain as if to a non-technical stakeholder.";
  if (value <= 40) return "Use accessible language with light technical terms. Define jargon when first used.";
  if (value <= 60) return "Use standard industry terminology. Assume familiarity with common concepts.";
  if (value <= 80) return "Use precise technical language. Assume strong domain expertise.";
  return "Use expert-level terminology freely. Assume deep specialist knowledge. Reference specifics without explaining basics.";
}

export function compileFormality(value: number): string {
  if (value <= 20) return "Be casual and conversational. Use contractions, short sentences, and a relaxed tone.";
  if (value <= 40) return "Be approachable but clear. Conversational tone with structured content when needed.";
  if (value <= 60) return "Balance professionalism with approachability. Use clear structure without being stiff.";
  if (value <= 80) return "Be professional and well-structured. Use proper formatting, clear sections, and measured tone.";
  return "Be formal and precise. Use structured formatting, professional register, and thorough documentation.";
}

export function compileProactivity(value: number): string {
  if (value <= 20) return "Only respond when directly asked. Do not volunteer information or suggestions.";
  if (value <= 40) return "Respond to what's asked. Occasionally flag critical risks but don't expand scope.";
  if (value <= 60) return "Answer the question and flag related issues or opportunities when relevant.";
  if (value <= 80) return "Proactively surface risks, opportunities, and suggestions. Anticipate follow-up questions.";
  return "Aggressively surface issues, suggest improvements, and challenge assumptions. Drive the conversation forward.";
}

export function compileDirectness(value: number): string {
  if (value <= 20) return "Be diplomatic and measured. Frame criticism as suggestions. Acknowledge positives before negatives.";
  if (value <= 40) return "Be tactful but honest. Soften disagreements with context and alternatives.";
  if (value <= 60) return "Be straightforward. State positions clearly while remaining respectful.";
  if (value <= 80) return "Be direct and unambiguous. State problems plainly. Don't hedge when you have a clear view.";
  return "Be blunt. Say exactly what you think. No sugar-coating, no hedging. Disagree openly when you disagree.";
}

export function compileCommunicationDirectives(dims: Record<string, number>): string {
  const parts: string[] = [];
  if (dims.verbosity !== undefined) parts.push(compileVerbosity(dims.verbosity));
  if (dims.technicality !== undefined) parts.push(compileTechnicality(dims.technicality));
  if (dims.formality !== undefined) parts.push(compileFormality(dims.formality));
  return parts.join("\n");
}

export function compileDecisionDirectives(dims: Record<string, number>): string {
  const parts: string[] = [];
  if (dims.proactivity !== undefined) parts.push(compileProactivity(dims.proactivity));
  if (dims.directness !== undefined) parts.push(compileDirectness(dims.directness));
  return parts.join("\n");
}
