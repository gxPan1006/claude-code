// Stub for BYOC file persistence — the code path gated by
// CLAUDE_CODE_ENVIRONMENT_KIND === 'byoc'. Local shell sessions never hit it,
// so plausible values are fine.

export const DEFAULT_UPLOAD_CONCURRENCY = 5;
export const FILE_COUNT_LIMIT = 1000;
export const OUTPUTS_SUBDIR = 'outputs';

export type TurnStartTime = number;

export type PersistedFile = {
  filename: string;
  file_id: string;
};

export type FailedPersistence = {
  filename: string;
  error: string;
};

export type FilesPersistedEventData = {
  files: PersistedFile[];
  failed: FailedPersistence[];
};
