'use client';

import { useEffect, useState } from 'react';

interface LiveBallotCountProps {
  electionId: string;
  initialCount: number;
}

export function LiveBallotCount({ electionId, initialCount }: LiveBallotCountProps) {
  const [count, setCount]       = useState(initialCount);
  const [updated, setUpdated]   = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/voting/elections/${electionId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { ballotCount: number };
        if (typeof data.ballotCount === 'number' && data.ballotCount !== count) {
          setCount(data.ballotCount);
          setUpdated(true);
          setTimeout(() => setUpdated(false), 1500);
        }
      } catch {
        // silent — polling failure doesn't break the page
      }
    };

    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionId]);

  return (
    <span
      style={{
        transition: 'color 0.4s',
        color: updated ? 'var(--color-primary)' : undefined,
        fontWeight: updated ? 600 : undefined,
      }}
    >
      {count} voto{count !== 1 ? 's' : ''} emitidos
    </span>
  );
}
