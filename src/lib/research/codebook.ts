/**
 * Shared research codebook.
 *
 * The codebook is the ONLY bridge between the two independent research pipelines:
 *   - Pipeline A (primary research): Google Forms answer options are mapped to codes
 *     deterministically by the explicit tables below. No AI is involved in survey counts.
 *   - Pipeline B (secondary research): the language model assigns codes to public
 *     feedback records, and every code must carry a verbatim quote from the record.
 *
 * Counts are never pooled across pipelines: survey counts use respondents as the unit
 * (denominator = respondents who answered the mapped question), public counts use
 * de-duplicated public records as the unit (denominator = validly analysed records).
 */

export const RESEARCH_CODES = [
  'cash_flow_disruption',
  'market_volatility_anxiety',
  'returns_performance_confusion',
  'investment_status_clarity',
  'payment_mandate_friction',
  'low_confidence_knowledge_gap',
  'external_help_seeking',
  'contribution_flexibility',
  'personalised_guidance_need',
  'support_service_issues',
  'goal_based_motivation',
  'social_influence_start',
] as const;

export type ResearchCode = (typeof RESEARCH_CODES)[number];

export interface CodeDefinition {
  code: ResearchCode;
  label: string;
  definition: string;
  /** 'problem' codes drive opportunity ranking; 'context' codes describe motivation/behaviour. */
  kind: 'problem' | 'behaviour' | 'motivation';
}

export const CODE_DEFINITIONS: Record<ResearchCode, CodeDefinition> = {
  cash_flow_disruption: {
    code: 'cash_flow_disruption',
    label: 'Cash-flow disruption',
    definition: 'Income level or timing, salary constraints, unexpected expenses or competing financial priorities make a SIP instalment hard to sustain.',
    kind: 'problem',
  },
  market_volatility_anxiety: {
    code: 'market_volatility_anxiety',
    label: 'Market volatility anxiety',
    definition: 'Market falls, losses or fluctuations cause worry or a wish to pause, reduce or stop.',
    kind: 'problem',
  },
  returns_performance_confusion: {
    code: 'returns_performance_confusion',
    label: 'Returns & performance confusion',
    definition: 'Difficulty understanding returns, NAV, negative or low returns, or how market movements affect a SIP.',
    kind: 'problem',
  },
  investment_status_clarity: {
    code: 'investment_status_clarity',
    label: 'Investment & allotment status clarity',
    definition: 'Uncertainty about where money is invested, whether units were allotted, or what in-app information/notifications mean.',
    kind: 'problem',
  },
  payment_mandate_friction: {
    code: 'payment_mandate_friction',
    label: 'Payment & mandate friction',
    definition: 'Autopay / bank mandate set-up, failed or missed debits, debit dates, or payment-status confusion.',
    kind: 'problem',
  },
  low_confidence_knowledge_gap: {
    code: 'low_confidence_knowledge_gap',
    label: 'Low confidence / knowledge gap',
    definition: 'Lack of understanding or confidence about how SIPs or mutual funds work; wants education.',
    kind: 'problem',
  },
  external_help_seeking: {
    code: 'external_help_seeking',
    label: 'Help-seeking outside the app',
    definition: 'Turns to Google, AI chatbots, YouTube, Reddit/forums, advisors, friends or family when unsure.',
    kind: 'behaviour',
  },
  contribution_flexibility: {
    code: 'contribution_flexibility',
    label: 'Contribution flexibility',
    definition: 'Wants to pause, skip, resume, change amount or change date of a SIP, or finds these controls missing.',
    kind: 'problem',
  },
  personalised_guidance_need: {
    code: 'personalised_guidance_need',
    label: 'Personalised decision guidance',
    definition: 'Wants guidance specific to their situation, e.g. whether to continue, stop, redeem or change a SIP.',
    kind: 'problem',
  },
  support_service_issues: {
    code: 'support_service_issues',
    label: 'Support & service issues',
    definition: 'Slow or unhelpful customer support, app bugs or service failures.',
    kind: 'problem',
  },
  goal_based_motivation: {
    code: 'goal_based_motivation',
    label: 'Goal-based motivation',
    definition: 'Started a SIP for a specific goal, long-term wealth, retirement or an emergency fund.',
    kind: 'motivation',
  },
  social_influence_start: {
    code: 'social_influence_start',
    label: 'Social influence at start',
    definition: 'Started a SIP because of friends, family, social media or financial content.',
    kind: 'motivation',
  },
};

/**
 * Deterministic survey option → code mapping, keyed by a fragment of the question
 * wording (case-insensitive match) and the exact option text. Options not listed
 * here are counted in the question tables but map to no code (e.g. "No significant confusion").
 */
export interface SurveyQuestionMapping {
  questionMatch: RegExp;
  role: 'motivation' | 'experienced_problem' | 'disruption_reason' | 'help_seeking' | 'stated_need' | 'disruption_behaviour';
  options: Record<string, ResearchCode[]>;
}

export const SURVEY_CODE_MAPPINGS: SurveyQuestionMapping[] = [
  {
    questionMatch: /primary reason for starting a SIP/i,
    role: 'motivation',
    options: {
      'Saving for a specific financial goal': ['goal_based_motivation'],
      'Long term wealth': ['goal_based_motivation'],
      'Retirement planning': ['goal_based_motivation'],
      'Emergency Fund': ['goal_based_motivation'],
      'Influence of friends or family': ['social_influence_start'],
      'Social media or financial content': ['social_influence_start'],
    },
  },
  {
    questionMatch: /confusion or concern while managing your SIP/i,
    role: 'experienced_problem',
    options: {
      'Payment or mandate status': ['payment_mandate_friction'],
      'Investment or allotment status': ['investment_status_clarity'],
      'Understanding returns or market movements': ['returns_performance_confusion'],
      'Understanding where my money is invested': ['investment_status_clarity'],
      'App notifications or information': ['investment_status_clarity'],
    },
  },
  {
    questionMatch: /what was the main reason/i,
    role: 'disruption_reason',
    options: {
      'Income or salary-related constraints': ['cash_flow_disruption'],
      'Unexpected expenses': ['cash_flow_disruption'],
      'Other financial priorities': ['cash_flow_disruption'],
      'Market fluctuations or losses': ['market_volatility_anxiety'],
      'Payment or mandate problems': ['payment_mandate_friction'],
      'Lack of confidence or understanding': ['low_confidence_knowledge_gap'],
    },
  },
  {
    questionMatch: /feeling unsure about your SIP/i,
    role: 'help_seeking',
    options: {
      'Search on Google or use AI': ['external_help_seeking'],
      'Watch YouTube for guidance': ['external_help_seeking'],
      'Read Reddit or investing forums': ['external_help_seeking'],
      'Consult a financial advisor': ['external_help_seeking'],
      'Ask friends or family': ['external_help_seeking'],
    },
  },
  {
    questionMatch: /more comfortable continuing your SIP/i,
    role: 'stated_need',
    options: {
      'Better explanations of market movements': ['returns_performance_confusion'],
      'Better payment and mandate support': ['payment_mandate_friction'],
      'Clearer information about investments and transactions': ['investment_status_clarity'],
      'More flexibility to manage contributions': ['contribution_flexibility'],
      'Easy-to-understand educational guidance': ['low_confidence_knowledge_gap'],
      'Faster customer support': ['support_service_issues'],
    },
  },
];

/**
 * Roles that report what the respondent experienced or did. 'stated_need' answers
 * ("what would make you more comfortable") are preferences, so they are reported
 * separately and never added to experience counts.
 */
export const EXPERIENCE_ROLES = new Set<SurveyQuestionMapping['role']>(['experienced_problem', 'disruption_reason', 'help_seeking', 'motivation']);

/**
 * Fine-grained signals used to test the two existing Groww LifeFlow concepts.
 * Survey coverage is stated explicitly: a signal the survey never asked about is
 * "not measured", which is different from "measured and absent".
 */
export const LIFEFLOW_SIGNALS = [
  'salary_timing',
  'income_constraint',
  'unexpected_expense',
  'debit_date_liquidity',
  'affordability_confusion',
  'market_volatility_anxiety',
  'market_movement_confusion',
  'sip_performance_uncertainty',
  'plain_language_explanation_need',
] as const;
export type LifeflowSignal = (typeof LIFEFLOW_SIGNALS)[number];

export interface LifeflowSignalDefinition {
  signal: LifeflowSignal;
  label: string;
  feature: 'life_to_sip' | 'market_pulse';
  /** Survey question fragment + option that measures this signal, or null if not measured. */
  survey: { questionMatch: RegExp; option: string; caveat?: string } | null;
}

export const LIFEFLOW_SIGNAL_DEFINITIONS: LifeflowSignalDefinition[] = [
  { signal: 'salary_timing', label: 'Salary delays / salary-date timing', feature: 'life_to_sip', survey: { questionMatch: /what was the main reason/i, option: 'Income or salary-related constraints', caveat: 'The survey option combines salary timing with income level, so it cannot isolate salary delays.' } },
  { signal: 'income_constraint', label: 'Income level / variable income', feature: 'life_to_sip', survey: { questionMatch: /what was the main reason/i, option: 'Income or salary-related constraints', caveat: 'Same option as salary timing; counts are not independent.' } },
  { signal: 'unexpected_expense', label: 'Unexpected expenses', feature: 'life_to_sip', survey: { questionMatch: /what was the main reason/i, option: 'Unexpected expenses' } },
  { signal: 'debit_date_liquidity', label: 'Low balance around the SIP debit date', feature: 'life_to_sip', survey: null },
  { signal: 'affordability_confusion', label: 'Unsure how much SIP is affordable', feature: 'life_to_sip', survey: null },
  { signal: 'market_volatility_anxiety', label: 'Market volatility anxiety', feature: 'market_pulse', survey: { questionMatch: /what was the main reason/i, option: 'Market fluctuations or losses' } },
  { signal: 'market_movement_confusion', label: 'Confusion about market movements', feature: 'market_pulse', survey: { questionMatch: /confusion or concern while managing your SIP/i, option: 'Understanding returns or market movements', caveat: 'One survey option covers both market-movement and return confusion.' } },
  { signal: 'sip_performance_uncertainty', label: 'Uncertainty about SIP performance / returns', feature: 'market_pulse', survey: { questionMatch: /confusion or concern while managing your SIP/i, option: 'Understanding returns or market movements', caveat: 'Shares the survey option with market-movement confusion.' } },
  { signal: 'plain_language_explanation_need', label: 'Need for plain-language market explanations', feature: 'market_pulse', survey: { questionMatch: /more comfortable continuing your SIP/i, option: 'Better explanations of market movements' } },
];

/** Candidate product opportunities. Membership is explicit; ranking is computed from evidence. */
export interface OpportunityDefinition {
  id: string;
  title: string;
  problemStatement: string;
  codes: ResearchCode[];
  existingConcept?: 'Life-to-SIP' | 'MARKET PULSE';
}

export const OPPORTUNITY_DEFINITIONS: OpportunityDefinition[] = [
  {
    id: 'opp-cash-flow',
    title: 'Cash-flow-aware SIP scheduling',
    problemStatement: 'Investors whose income or expenses shift struggle to keep a fixed instalment, and reduce or stop instead of adapting the SIP.',
    codes: ['cash_flow_disruption', 'contribution_flexibility'],
    existingConcept: 'Life-to-SIP',
  },
  {
    id: 'opp-market-context',
    title: 'Plain-language market & returns context',
    problemStatement: 'Investors do not understand why returns move with markets, and volatility triggers anxiety-driven pauses.',
    codes: ['market_volatility_anxiety', 'returns_performance_confusion'],
    existingConcept: 'MARKET PULSE',
  },
  {
    id: 'opp-status-transparency',
    title: 'Payment, mandate & allotment transparency',
    problemStatement: 'Investors cannot tell whether a debit succeeded, units were allotted, or where money sits, which creates distrust.',
    codes: ['payment_mandate_friction', 'investment_status_clarity'],
  },
  {
    id: 'opp-decision-support',
    title: 'In-app decision support for continue / pause / stop',
    problemStatement: 'Unsure investors leave the app for Google, AI or YouTube to decide whether to continue, and want guidance specific to them.',
    codes: ['personalised_guidance_need', 'external_help_seeking', 'low_confidence_knowledge_gap'],
  },
  {
    id: 'opp-support',
    title: 'Faster resolution of service issues',
    problemStatement: 'Bugs and slow support erode confidence during SIP problems.',
    codes: ['support_service_issues'],
  },
];

export function codeLabel(code: string): string {
  return (CODE_DEFINITIONS as Record<string, CodeDefinition>)[code]?.label ?? code;
}

export function isResearchCode(value: unknown): value is ResearchCode {
  return typeof value === 'string' && (RESEARCH_CODES as readonly string[]).includes(value);
}

export function isLifeflowSignal(value: unknown): value is LifeflowSignal {
  return typeof value === 'string' && (LIFEFLOW_SIGNALS as readonly string[]).includes(value);
}
