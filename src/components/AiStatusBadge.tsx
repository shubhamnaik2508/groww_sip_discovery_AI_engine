import { groqConfigured, groqModel } from '@/services/ai/groq';

/** Server component: states whether live AI inference is configured, without exposing secrets. */
export function AiStatusBadge() {
  const live = groqConfigured();
  return (
    <span className="badge badge-neutral" title={live ? `Live inference available via Groq (${groqModel()})` : 'No AI key on this server: stored AI runs are shown; live runs are disabled.'}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: live ? '#2dd4bf' : '#f59e0b', marginRight: 6 }} />
      {live ? 'Live AI: Groq' : 'Live AI: not configured'}
    </span>
  );
}
