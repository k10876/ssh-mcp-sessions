import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { resolve as resolvePath } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ValidationError } from './errors.js';

export const DEFAULT_MAX_INACTIVITY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_APP_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions');
export const DEFAULT_CONFIG_PATH = resolvePath(DEFAULT_APP_DIR, 'config.yaml');

const ReminderRuleSchema = z.object({
  when: z.enum(['input', 'output', 'both']),
  pattern: z.string().min(1, 'Reminder rule pattern is required'),
  flags: z.string().optional(),
  reminder: z.string().min(1, 'Reminder text is required'),
});

const UserConfigSchema = z.object({
  exec: z
    .object({
      reminders: z.array(ReminderRuleSchema).default([]),
    })
    .default({ reminders: [] }),
}).default({ exec: { reminders: [] } });

export type ExecReminderRule = z.infer<typeof ReminderRuleSchema>;
export type UserConfig = z.infer<typeof UserConfigSchema>;

export type CompiledExecReminderRule = ExecReminderRule & {
  regex: RegExp;
};

export function getMaxInactivityMs(env = process.env): number {
  const raw = env.SSH_CLI_MAX_INACTIVITY_MS;
  if (!raw) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  if (!/^\d+$/.test(raw)) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAX_INACTIVITY_MS;
  }

  return parsed;
}

export async function loadUserConfig(configPath = DEFAULT_CONFIG_PATH): Promise<UserConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      return { exec: { reminders: [] } };
    }

    throw new ValidationError(`Failed to read config '${configPath}': ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(raw);
  } catch (error) {
    throw new ValidationError(`Failed to parse config '${configPath}': ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = UserConfigSchema.safeParse(parsedYaml ?? {});
  if (!parsed.success) {
    throw new ValidationError(`Invalid config '${configPath}': ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  return parsed.data;
}

export function compileExecReminderRules(rules: ExecReminderRule[]): CompiledExecReminderRule[] {
  return rules.map((rule, index) => {
    try {
      return {
        ...rule,
        regex: new RegExp(rule.pattern, rule.flags),
      };
    } catch (error) {
      throw new ValidationError(
        `Invalid exec reminder regex at rule ${index + 1} ('${rule.pattern}'): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

export function getMatchingExecReminders(
  command: string,
  output: string,
  rules: CompiledExecReminderRule[],
): string[] {
  return rules
    .filter((rule) => matchesExecReminderRule(rule, command, output))
    .map((rule) => rule.reminder);
}

function matchesExecReminderRule(rule: CompiledExecReminderRule, command: string, output: string): boolean {
  switch (rule.when) {
    case 'input':
      return rule.regex.test(command);
    case 'output':
      return rule.regex.test(output);
    case 'both':
      return rule.regex.test(command) || rule.regex.test(output);
  }
}
