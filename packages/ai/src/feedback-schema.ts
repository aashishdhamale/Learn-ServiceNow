import { z } from 'zod';

/**
 * What Claude must return. Kept flat and fully required so it maps cleanly onto structured
 * outputs; empty strings stand in for "none".
 */
export const ArchitectFeedbackSchema = z.object({
  summary: z
    .string()
    .describe('One or two sentences: the overall impression an architect would give.'),
  whatWorks: z.array(z.string()).describe('Two to four specific strengths, each tied to the code.'),
  boardChallenges: z
    .array(
      z.object({
        rubricId: z
          .string()
          .describe('Id of the rubric criterion this relates to, or an empty string.'),
        concern: z.string().describe('The question or concern a CTA review board would raise.'),
        whyItMatters: z
          .string()
          .describe(
            'Why it matters in production: security, performance, upgradeability, UX or supportability.',
          ),
      }),
    )
    .describe('Two or three challenges a CTA review board would raise.'),
  improvement: z
    .object({
      title: z.string().describe('The single most valuable change, as a short imperative.'),
      detail: z.string().describe('What to change and why, in two to four sentences.'),
      example: z.string().describe('A short code example of the change, or an empty string.'),
    })
    .describe('One concrete improvement.'),
});

export type ArchitectFeedbackOutput = z.infer<typeof ArchitectFeedbackSchema>;
