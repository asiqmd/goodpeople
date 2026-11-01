import {
  MIN_PEERS_SHOWN,
  PEER_QUESTIONS,
  RATINGS,
  type DistributionRow,
  type PeerQuestion,
  type PeerSummary,
  type Rating,
} from '@gp/shared';

// The arithmetic of a review: the goal score, how a set of ratings spreads against the
// workspace's guide, and peer feedback put together for the person.

/**
 * The manager's goal ratings averaged by the goals' weights, to two decimals; equal weights when
 * no goal carries one. Goals the manager has not rated do not count. null without a rating.
 */
export function goalScore(
  goals: readonly { id: string; weight: string | number | null }[],
  ratings: Readonly<Record<string, { rating: number }>>,
): string | null {
  const rated = goals.filter((g) => ratings[g.id]);
  if (rated.length === 0) return null;
  const weights = rated.map((g) => Number(g.weight ?? 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const share = (i: number) => (total > 0 ? weights[i]! / total : 1 / rated.length);
  const score = rated.reduce((sum, g, i) => sum + ratings[g.id]!.rating * share(i), 0);
  return (Math.round(score * 100) / 100).toFixed(2);
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** How many of the ratings given are each rating, in count and percent, beside the guide. */
export function distribution(
  ratings: readonly (number | null)[],
  guide: Readonly<Record<Rating, number>>,
): DistributionRow[] {
  const given = ratings.filter((r): r is number => r !== null);
  return RATINGS.map((rating) => {
    const count = given.filter((r) => r === rating).length;
    return {
      rating,
      count,
      percent: given.length ? oneDecimal((count / given.length) * 100) : 0,
      guidePercent: guide[rating] ?? 0,
    };
  });
}

/**
 * What the person may see of their peers' feedback: each question's answers together, sorted
 * so their order says nothing of who wrote them or when, and the average rating; nothing from
 * fewer than MIN_PEERS_SHOWN peers.
 */
export function peerSummary(
  submitted: readonly {
    answers: Partial<Record<PeerQuestion, string>> | null;
    rating: number | null;
  }[],
): PeerSummary {
  const empty = Object.fromEntries(PEER_QUESTIONS.map((q) => [q, []])) as unknown as Record<
    PeerQuestion,
    string[]
  >;
  if (submitted.length < MIN_PEERS_SHOWN) {
    return { shown: false, answers: empty, averageRating: null };
  }
  const answers = Object.fromEntries(
    PEER_QUESTIONS.map((q) => [
      q,
      submitted
        .map((s) => s.answers?.[q]?.trim())
        .filter((a): a is string => !!a)
        .toSorted((a, b) => a.localeCompare(b)),
    ]),
  ) as Record<PeerQuestion, string[]>;
  const ratings = submitted.flatMap((s) => (s.rating ? [s.rating] : []));
  return {
    shown: true,
    answers,
    averageRating: ratings.length
      ? oneDecimal(ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
      : null,
  };
}
