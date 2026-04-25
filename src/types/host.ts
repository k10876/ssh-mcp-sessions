import { z } from 'zod';

export const StoredHostSchema = z.object({
  id: z.string(),
  host: z.string(),
  port: z.number().int().positive().default(22),
  username: z.string(),
  password: z.string().optional(),
  keyPath: z.string().optional(),
});

export const HostsSchema = z.object({
  hosts: z.array(StoredHostSchema).default([]),
});

export type StoredHost = z.infer<typeof StoredHostSchema>;
export type HostsFile = z.infer<typeof HostsSchema>;
