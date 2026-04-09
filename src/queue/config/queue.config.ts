import type { DefaultJobOptions } from 'bullmq';

/**
 *
 *
 * Queue configuration
 * Retry strategy lives here so it is defined once and never duplicated.
 *
 * Retry config (3 attempts, exponential backoff):
 *   attempt 1 → immediate
 *   attempt 2 → 2 s delay
 *   attempt 3 → 4 s delay
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 200,
};
