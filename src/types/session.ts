export type CommandResult = {
  output: string;
  exitCode: number;
};

export type SessionInfo = {
  id: string;
  host: string;
  port: number;
  username: string;
  createdAt: number;
  lastCommand: string | null;
  disposed: boolean;
};

export type ActiveSessionInfo = SessionInfo & {
  status: 'active';
  logPath: string;
};
