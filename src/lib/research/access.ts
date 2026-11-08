/**
 * Access model (no passcodes, no sign-in).
 *
 * Public deployments (any Vercel environment: production or preview) are READ-ONLY.
 * Every visitor can explore all stored research, but the server refuses AI execution
 * and data changes there, regardless of which keys are configured. This is enforced
 * inside the server actions, not just by hiding buttons.
 *
 * Authorised live analysis (Gemini preferred, Groq optional) and data changes run only in
 * the researcher's private workspace (a local copy), where the API keys are kept.
 */
export function isPublicDeployment(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}

/** Live AI execution is allowed only in the private workspace. */
export function liveAiAllowed(): boolean {
  return !isPublicDeployment();
}

/** Survey imports and validation reviews are allowed only in the private workspace. */
export function dataChangesAllowed(): boolean {
  return !isPublicDeployment();
}

export const READ_ONLY_MESSAGE =
  'This public copy of the Discovery Engine is read-only. New AI runs, imports and reviews are performed in the researcher’s private workspace and published as stored results.';
