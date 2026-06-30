'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MissionProgress } from '@/types';
import {
  completedMissionFeedPollIntervalMs,
  getMissionProgressQueryOptions,
  missionProgressPollIntervalMs,
} from '../_lib/mobile-mission-progress';

type Options = {
  workspaceId: string;
  missionId: string;
  missionStatus: string;
  enabled?: boolean;
  poll?: boolean;
  /** Completed mission — poll /progress while feed production is active. */
  pollFeedProduction?: boolean;
};

export function useMissionProgress(options: Options) {
  const unchangedPollsRef = useRef(0);
  const lastCompletionRef = useRef<number | null>(null);

  const base = getMissionProgressQueryOptions(options);

  const shouldPoll = options.poll || options.pollFeedProduction;

  return useQuery({
    ...base,
    refetchInterval: shouldPoll
      ? (query) => {
          const prog = query.state.data as MissionProgress | undefined;
          const completion = prog?.completion_pct ?? 0;
          if (lastCompletionRef.current === completion) {
            unchangedPollsRef.current += 1;
          } else {
            unchangedPollsRef.current = 0;
            lastCompletionRef.current = completion;
          }
          if (options.pollFeedProduction) {
            return completedMissionFeedPollIntervalMs(unchangedPollsRef.current);
          }
          return missionProgressPollIntervalMs(
            options.missionStatus,
            prog,
            unchangedPollsRef.current,
          );
        }
      : false,
  });
}
