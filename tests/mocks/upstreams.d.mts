export interface MockHandle { server: import("node:http").Server; port: number; url: string; close(): Promise<void> }
export const USERS: Record<string, { id: string; email: string; role: string }>;
export const INITIAL_HEAD: string;
export const PROPOSE_INPUT: unknown;
export function startMocks(port?: number, host?: string): Promise<MockHandle>;
