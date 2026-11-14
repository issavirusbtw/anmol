import type { Server } from 'node:http';
export function attachMp(httpServer: Server | null | object): void;
export function decodeFrames(buf: Uint8Array): { frames: { op: number; fin: boolean; data: Uint8Array }[]; rest: Uint8Array } | null;
export function encodeFrame(op: number, data: Uint8Array): Uint8Array;
