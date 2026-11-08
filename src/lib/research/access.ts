/** Whether mutating research actions require the passcode on this deployment. */
export function needsPasscode(): boolean {
  return Boolean(process.env.RESEARCH_ADMIN_PASSCODE) || process.env.VERCEL_ENV === 'production';
}
