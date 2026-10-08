import type { ArchitectReviewer } from '@snow-mastery/grader';

/**
 * Deterministic stand-in for Claude (AI_REVIEW_MODE=mock), used by e2e tests and for working
 * on the UI without an API key. It only echoes the request back in feedback form.
 */
export const mockReviewer: ArchitectReviewer = async (request) => {
  const problems = request.deterministic.flatMap((layer) =>
    layer.problems.filter((p) => p.severity === 'error'),
  );
  const [first, second] = request.scenario.rubric;
  return {
    status: 'ok',
    model: 'mock',
    feedback: {
      summary:
        problems.length > 0
          ? `Mock review: fix the ${problems.length} blocking problem(s) first, then revisit the design questions below.`
          : 'Mock review: the solution meets the requirement; here is what a review board would still probe.',
      whatWorks: request.scripts.map((s) => `${s.name} is in place as a ${s.kind}-side script.`),
      boardChallenges: [first, second]
        .filter((r) => r !== undefined)
        .map((r) => ({
          rubricId: r.id,
          concern: `How does your design satisfy: ${r.criterion}`,
          whyItMatters: 'Review boards probe every rubric criterion.',
        })),
      improvement: {
        title: problems[0] ? `Fix: ${problems[0].title}` : 'Make the message translatable',
        detail: problems[0]?.message ?? 'Use getMessage() so the alert can be translated.',
      },
    },
  };
};
