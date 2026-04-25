import { z } from 'zod';

export const CliAddHostOptionsSchema = z
  .object({
    host: z.string().trim().min(1, 'Host target is required'),
    port: z.number().int().positive().default(22),
    keyPath: z.string().trim().min(1).optional(),
    password: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.keyPath && value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use either --key-path or --password, not both',
        path: ['keyPath'],
      });
    }
  });

export type CliAddHostOptions = z.infer<typeof CliAddHostOptionsSchema>;

export type CliStartOptions = {
  host: string;
};

export type CliExecOptions = {
  auto: boolean;
};

export type CliLogsOptions = {
  lines?: number;
  follow: boolean;
};

export type ParsedCliCommand =
  | { kind: 'help'; topic?: string }
  | { kind: 'version' }
  | { kind: 'add-host'; name: string; username: string; options: CliAddHostOptions }
  | { kind: 'start'; sessionName: string; options: CliStartOptions }
  | { kind: 'exec'; sessionName: string; command: string; options: CliExecOptions }
  | { kind: 'list' }
  | { kind: 'kill'; sessionName: string }
  | { kind: 'logs'; sessionName: string; options: CliLogsOptions }
  | { kind: 'attach'; sessionName: string }
  | { kind: 'mcp'; args: string[] };
