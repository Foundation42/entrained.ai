// Provider-agnostic AI evaluation service
import type { ContentEvaluation, EvaluationFlag, ProfileStats, Env } from '../types';
import { nanoid } from 'nanoid';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

interface EvaluationContext {
  parentContent?: string;
  threadSummary?: string;
  communityCriteria?: string;
  userHistorySummary?: string;
}

interface RawEvaluationResult {
  scores: {
    good_faith: number;
    substantive: number;
    charitable: number;
    source_quality: number;
  };
  flags: EvaluationFlag[];
  suggestions: string[];
  reasoning: string;
}

// Build the evaluation prompt
function buildEvaluationPrompt(
  content: string,
  context: EvaluationContext
): string {
  return `You are evaluating a comment for discourse quality on a debate platform.

Your role is to assess whether the comment engages in good faith, not whether you agree with its position.

COMMENT TO EVALUATE:
"""
${content}
"""

${context.parentContent ? `PARENT COMMENT (if replying):
"""
${context.parentContent}
"""` : ''}

${context.threadSummary ? `THREAD CONTEXT:
${context.threadSummary}` : ''}

${context.communityCriteria ? `COMMUNITY EVALUATION CRITERIA:
${context.communityCriteria}` : ''}

${context.userHistorySummary ? `USER'S RECENT BEHAVIOR:
${context.userHistorySummary}` : ''}

Evaluate on these dimensions (0-100):

1. GOOD FAITH (0-100)
   - Is this genuinely engaging with ideas vs. trolling/baiting?
   - Does it assume best intentions of others?
   - Is the tone conducive to productive discussion?

2. SUBSTANTIVE (0-100)
   - Does it add new information or perspective?
   - Is there meaningful analysis or reasoning?
   - Or is it just restating known positions?

3. CHARITABLE (0-100)
   - Does it represent opposing views accurately?
   - Does it engage with the strongest version of counterarguments?
   - Or does it strawman/misrepresent?

4. SOURCE QUALITY (0-100)
   - Are factual claims backed by credible sources?
   - Are sources appropriate for the claims made?
   - Is there proper attribution?

Look for these RED FLAGS:
- Strawman arguments (misrepresenting opponent's position)
- Ad hominem attacks (attacking person not argument)
- Unsourced factual claims (stating facts without evidence)
- Misrepresentation (twisting parent's words)
- Inflammatory language (designed to provoke not persuade)

Return JSON in this exact format:
{
  "scores": {
    "good_faith": <number 0-100>,
    "substantive": <number 0-100>,
    "charitable": <number 0-100>,
    "source_quality": <number 0-100>
  },
  "flags": [
    {
      "type": "strawman" | "ad_hominem" | "unsourced_claim" | "misrepresentation" | "inflammatory",
      "severity": "info" | "warning" | "critical",
      "explanation": "<specific explanation>",
      "quote": "<exact text that triggered this>"
    }
  ],
  "suggestions": [
    "<constructive suggestion for improvement>"
  ],
  "reasoning": "<brief explanation of scores>"
}

Remember: You can score low on good faith while disagreeing with popular opinion. Someone arguing an unpopular position with evidence and charity should score HIGHLY.`;
}

// Call Gemini API
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('No content in Gemini response');
  }

  return content;
}

// Main evaluation function
export async function evaluateContent(
  content: string,
  contentType: 'post' | 'comment',
  context: EvaluationContext,
  env: Env
): Promise<ContentEvaluation> {
  const prompt = buildEvaluationPrompt(content, context);

  const rawResult = await callGemini(
    prompt,
    env.GEMINI_API_KEY,
    env.AI_MODEL
  );

  let parsed: RawEvaluationResult;
  try {
    parsed = JSON.parse(rawResult);
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${e}`);
  }

  // Validate and clamp scores
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const evaluation: ContentEvaluation = {
    id: nanoid(),
    content_id: '', // Will be set by caller
    content_type: contentType,
    evaluated_at: Date.now(),
    model_version: env.AI_MODEL,
    scores: {
      good_faith: clamp(parsed.scores?.good_faith ?? 50),
      substantive: clamp(parsed.scores?.substantive ?? 50),
      charitable: clamp(parsed.scores?.charitable ?? 50),
      source_quality: clamp(parsed.scores?.source_quality ?? 50),
    },
    flags: parsed.flags ?? [],
    suggestions: parsed.suggestions ?? [],
    reasoning: parsed.reasoning ?? ''
  };

  return evaluation;
}

// Calculate stat impact from evaluation
export function calculateStatImpact(
  evaluation: ContentEvaluation,
  profileStats: ProfileStats
): {
  cloakQuotaDelta: number;
  statChanges: Partial<ProfileStats>;
} {
  const { scores } = evaluation;

  // Compare to user's current stats - 5% weight per comment
  const deltas = {
    good_faith: (scores.good_faith - profileStats.good_faith) * 0.05,
    substantive: (scores.substantive - profileStats.substantive) * 0.05,
    charitable: (scores.charitable - profileStats.charitable) * 0.05,
    source_quality: (scores.source_quality - profileStats.source_quality) * 0.05,
  };

  // Cloak quota impact (more severe for bad faith)
  let quotaDelta = 0;
  if (scores.good_faith < 30) quotaDelta = -10;
  else if (scores.good_faith < 50) quotaDelta = -5;
  else if (scores.good_faith > 80) quotaDelta = +2;

  // Critical flags have additional penalty
  const criticalCount = evaluation.flags.filter(f => f.severity === 'critical').length;
  quotaDelta -= criticalCount * 5;

  return {
    cloakQuotaDelta: quotaDelta,
    statChanges: deltas
  };
}

// Pre-submit check (evaluate before posting)
export async function preSubmitCheck(
  content: string,
  contentType: 'post' | 'comment',
  context: EvaluationContext,
  profileStats: ProfileStats,
  env: Env
): Promise<{
  evaluation: ContentEvaluation;
  canSubmit: boolean;
  warnings: EvaluationFlag[];
  suggestions: string[];
  predictedImpact: {
    cloakQuotaDelta: number;
    statChanges: Partial<ProfileStats>;
  };
}> {
  const evaluation = await evaluateContent(content, contentType, context, env);
  const impact = calculateStatImpact(evaluation, profileStats);

  const criticalFlags = evaluation.flags.filter(f => f.severity === 'critical');

  return {
    evaluation,
    canSubmit: true, // Always allow, but warn
    warnings: criticalFlags,
    suggestions: evaluation.suggestions,
    predictedImpact: impact
  };
}
