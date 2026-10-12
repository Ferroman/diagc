/** A handler's answer: the status and the JSON body a host sends as it is. */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/** The answer to a request a handler will not carry out: one issue saying why, the
 * shape the studio reads every refusal in. */
export function refuse(status: number, message: string): HandlerResult {
  return { status, body: { issues: [{ message }] } };
}
