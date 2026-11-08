import { llmConfigured, llmLabel } from '@/services/ai/llm';
import { isPublicDeployment } from '@/lib/research/access';
import { demoEnabledByConfig } from '@/services/demo/guard';
import { getUsageStore } from '@/services/demo/usage-store';

/**
 * Server component. Public visitors see whether the live AI demo is on, never configuration
 * warnings; the researcher's private workspace shows which model serves official runs.
 */
export function AiStatusBadge() {
  const publicSite = isPublicDeployment();
  const live = publicSite ? demoEnabledByConfig() && getUsageStore() !== null && llmConfigured() : llmConfigured();
  const label = publicSite ? (live ? `Live AI demo · ${llmLabel()}` : 'Stored AI results · Gemini') : live ? `Private workspace · ${llmLabel()}` : 'Private workspace · no AI key';
  return (
    <span className="badge badge-neutral" title={publicSite ? 'Stored results are always available; the live demo runs within a shared daily allowance.' : 'Local private workspace'}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: live ? '#2dd4bf' : '#7dd3fc', marginRight: 6 }} />
      {label}
    </span>
  );
}
