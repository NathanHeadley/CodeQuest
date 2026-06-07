import { config } from "../config.js";

/**
 * Forward a code submission to the Python ast validator microservice.
 * Returns { valid: boolean, feedback: string }.
 * Throws if the validator is unreachable / errors (caller maps to 502).
 */
export async function validateCode(actionName, code) {
  const r = await fetch(`${config.validatorUrl}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action_name: actionName, code }),
    signal: AbortSignal.timeout(5000),
  });
  // 400 is a legitimate "unknown action" response carrying JSON we can pass through.
  if (!r.ok && r.status !== 400) {
    throw new Error(`validator returned ${r.status}`);
  }
  return r.json();
}
