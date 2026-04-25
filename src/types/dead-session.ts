export type DeadSessionInfo = {
  id: string;
  host: string;
  port: number;
  username: string;
  createdAt: number;
  lastCommand: string | null;
  reason: string;
  logPath: string;
  detectedAt: number;
};
