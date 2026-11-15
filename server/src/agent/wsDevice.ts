import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { ServerMessage } from "../protocol.js";
import type { ActionResult, AgentAction, AgentDevice, Expectation, Observation, VerifyResult } from "./types.js";

// AgentDevice over the session's WebSocket: each call is an agent_request with a requestId, answered by
// an agent_response. Responses are validated (the client is a separate build) and every wait has a
// timeout, so a crashed/disconnected device can never hang the runner (and the user's turn lock).

const TIMEOUTS_MS = { observe: 15_000, act: 90_000, verify: 15_000 };

const observationSchema = z
  .object({
    platform: z.string().max(32).optional(),
    activeWindow: z.object({ title: z.string().max(500), app: z.string().max(200).optional() }).optional(),
    windows: z.array(z.object({ title: z.string().max(500), app: z.string().max(200).optional() })).max(100).optional(),
    elements: z.string().max(60_000).optional(),
    notes: z.array(z.string().max(2000)).max(50).optional(),
  })
  .passthrough();

const actionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(20_000),
  data: z.unknown().optional(),
  needsConfirmation: z.object({ prompt: z.string().max(500), kind: z.enum(["delete", "overwrite", "click", "screen", "clipboard", "shortcut"]).optional(), target: z.string().max(500).optional() }).optional(),
  observation: observationSchema.optional(),
});

const verifySchema = z.object({ ok: z.boolean(), detail: z.string().max(2000) });

type Kind = keyof typeof TIMEOUTS_MS;
interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class WsAgentDevice implements AgentDevice {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly taskId: string,
    private readonly send: (msg: ServerMessage) => void
  ) {}

  observe(): Promise<Observation> {
    return this.request("observe", {}).then((r) => observationSchema.parse(r) as Observation);
  }

  act(action: AgentAction): Promise<ActionResult> {
    return this.request("act", { action }).then((r) => {
      const parsed = actionResultSchema.safeParse(r);
      return parsed.success ? (parsed.data as ActionResult) : { ok: false, message: "The computer sent an unreadable result." };
    });
  }

  verify(expect: Expectation): Promise<VerifyResult> {
    return this.request("verify", { expect }).then((r) => verifySchema.parse(r));
  }

  // agent_response from the client.
  handleResponse(requestId: string, result: unknown): void {
    const p = this.pending.get(requestId);
    if (!p) return; // late/unknown — ignore
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(result);
  }

  // Connection gone or task cancelled: fail every outstanding request immediately.
  abort(reason = "device disconnected"): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private request(kind: Kind, payload: { action?: AgentAction; expect?: Expectation }): Promise<unknown> {
    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`no answer from the computer (${kind})`));
      }, TIMEOUTS_MS[kind]);
      this.pending.set(requestId, { resolve, reject, timer });
      this.send({ type: "agent_request", taskId: this.taskId, requestId, kind, ...payload });
    });
  }
}
