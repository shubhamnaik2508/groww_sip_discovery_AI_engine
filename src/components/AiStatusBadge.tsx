import { llmConfigured, llmLabel } from '@/services/ai/llm';

/** Server component: states which model serves live AI, without exposing any secret. */
export function AiStatusBadge() {
  const live = llmConfigured();
  return (
    <span className="badge badge-neutral" title={live ? `Live inference available: ${llmLabel()}` : 'No AI key on this server: stored AI runs are shown; live runs are disabled.'}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: live ? '#2dd4bf' : '#f59e0b', marginRight: 6 }} />
      {live ? `Live AI: ${llmLabel()}` : 'Live AI: not configured'}
    </span>
  );
}
