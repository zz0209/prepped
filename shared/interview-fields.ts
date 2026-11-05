// The field of a job interview and the rounds each field's interviews have. The field decides what an answer draws on
// and how it is built (server/interview-guidance.ts), which rounds the setup offers, and what preparation expects; it is
// guessed from the target role (fieldFromRole) until the person picks one.

export const INTERVIEW_FIELDS = [
  'software', 'data', 'design', 'product', 'marketing', 'sales', 'customer', 'consulting', 'finance', 'operations', 'people',
  'healthcare', 'education', 'legal', 'research', 'writing', 'other',
] as const;
export type InterviewField = typeof INTERVIEW_FIELDS[number];

export const INTERVIEW_ROUNDS = [
  'screening', 'hiring-manager', 'technical', 'coding', 'system-design', 'behavioral', 'case', 'panel', 'final', 'other',
  'portfolio-review', 'design-challenge', 'critique', 'product-sense', 'metrics', 'estimation', 'role-play', 'presentation', 'scenario', 'work-sample',
] as const;
export type InterviewRound = typeof INTERVIEW_ROUNDS[number];

/** Rounds every field has. */
export const COMMON_ROUNDS: InterviewRound[] = ['screening', 'hiring-manager', 'behavioral', 'panel', 'final', 'other'];
/** The rounds particular to each field's interviews, in the order they usually come. */
export const FIELD_ROUNDS: Record<InterviewField, InterviewRound[]> = {
  software: ['technical', 'coding', 'system-design'],
  data: ['technical', 'coding', 'case', 'metrics'],
  design: ['portfolio-review', 'design-challenge', 'critique'],
  product: ['product-sense', 'metrics', 'estimation', 'case'],
  marketing: ['case', 'portfolio-review', 'metrics', 'presentation'],
  sales: ['role-play', 'presentation'],
  customer: ['role-play', 'scenario'],
  consulting: ['case', 'estimation'],
  finance: ['technical', 'case', 'presentation'],
  operations: ['case', 'metrics', 'scenario'],
  people: ['scenario', 'case'],
  healthcare: ['scenario', 'technical'],
  education: ['presentation', 'scenario'],
  legal: ['technical', 'scenario', 'work-sample'],
  research: ['presentation', 'technical'],
  writing: ['portfolio-review', 'work-sample'],
  other: ['technical', 'case', 'portfolio-review', 'presentation', 'role-play', 'scenario', 'work-sample'],
};

/** The rounds the setup offers for a field: the field's own first, then the common ones; `current` stays offered. */
export function roundsFor(field: InterviewField | null, current?: InterviewRound): InterviewRound[] {
  const own = field ? FIELD_ROUNDS[field] : INTERVIEW_ROUNDS.filter(round => !COMMON_ROUNDS.includes(round));
  const rounds = [COMMON_ROUNDS[0]!, COMMON_ROUNDS[1]!, ...own, ...COMMON_ROUNDS.slice(2)];
  return current && !rounds.includes(current) ? [...rounds, current] : rounds;
}

/** Fields whose interviews are built on a portfolio of the person's work. */
export const PORTFOLIO_FIELDS: InterviewField[] = ['design', 'marketing', 'writing'];

// Words of a target role (or a job posting's or a calendar event's title) that name its field, in the interface's five
// languages. More particular fields come first: a "UX engineer" is a designer, a "data engineer" works with data, a
// "sales consultant" sells, and "engineer" alone means software. Words that also name an interview round ("HR面",
// "採用面接") are left out, so an event's title does not turn its round into a field.
const FIELD_WORDS: [InterviewField, RegExp][] = [
  ['design', /\b(?:designer|design (?:lead|manager|director)|ux|ui\/ux|ui designer|user experience|interaction design|visual design|brand design|graphic design|art director|industrial design|motion design)\b|设计师|交互设计|视觉设计|体验设计|デザイナー|디자이너|diseñador|diseñadora/i],
  ['product', /\b(?:product manager|product owner|product lead|group product manager|head of product|(?:senior|associate|technical|group) pm)\b|产品经理|产品负责人|プロダクトマネージャー|プロダクトオーナー|프로덕트 매니저|기획자|gerente de producto/i],
  ['data', /\b(?:data (?:scientist|analyst|engineer)|analytics|business intelligence|bi analyst|machine learning|ml engineer|statistician)\b|数据分析|数据科学|数据工程|算法工程师|データサイエンティスト|データアナリスト|데이터 (?:분석|사이언티스트|엔지니어)|científic[oa] de datos|analista de datos/i],
  ['research', /\b(?:researcher|research scientist|postdoc(?:toral)?|professor|faculty|phd)\b|研究员|博士后|教授|研究者|研究員|연구원|교수|investigador|investigadora|catedrátic/i],
  ['legal', /\b(?:lawyer|attorney|counsel|paralegal|legal|solicitor|barrister)\b|律师|法务|弁護士|法務|변호사|법무|abogad[oa]|asesor jurídico/i],
  ['healthcare', /\b(?:nurse|physician|doctor|resident|clinical|pharmacist|therapist|dentist|surgeon)\b|护士|医生|医师|药剂师|看護師|医師|薬剤師|간호사|의사|약사|enfermer[oa]|médic[oa]|farmacéutic/i],
  ['education', /\b(?:teacher|lecturer|tutor|instructor|educator|teaching assistant)\b|教师|老师|讲师|助教|教員|講師|교사|강사|profesor|profesora|maestr[oa]|docente/i],
  ['finance', /\b(?:finance|financial|investment bank(?:ing)?|banker|equity research|private equity|accountant|accounting|auditor|controller|treasury|fp&a)\b|金融|财务|会计|投行|审计|投資銀行|経理|財務|会計|재무|회계|투자은행|finanzas|contador|contadora|auditor/i],
  ['customer', /\b(?:customer success|customer support|support specialist|customer service|client services)\b|客服|客户成功|カスタマーサクセス|カスタマーサポート|고객 성공|고객 지원|atención al cliente|éxito del cliente/i],
  ['sales', /\b(?:sales|account executive|business development|sdr|bdr|account manager)\b|销售|商务拓展|大客户|営業|영업|ventas|ejecutiv[oa] de cuentas|comercial/i],
  ['consulting', /\b(?:consultant|consulting|strategy analyst|strategy associate)\b|咨询|顾问|コンサルタント|컨설턴트|consultor|consultora/i],
  ['marketing', /\b(?:marketing|growth (?:marketer|marketing|manager|lead)|seo|brand manager|content strategist|communications|public relations|pr manager)\b|市场|营销|品牌经理|マーケティング|広報|마케팅|홍보|mercadotecnia/i],
  ['people', /\b(?:recruiter|recruiting coordinator|human resources|hr (?:manager|generalist|business partner|specialist)|people partner|talent acquisition|hrbp)\b|招聘专员|招聘经理|人力资源|人事担当|採用担当|리크루터|인사 담당|recursos humanos|reclutador|reclutadora/i],
  ['operations', /\b(?:operations|supply chain|logistics|procurement|project manager|program manager)\b|运营|供应链|物流|采购|项目经理|オペレーション|운영|물류|operaciones|logística/i],
  ['writing', /\b(?:writer|copywriter|editor|journalist|content writer|technical writer)\b|作家|编辑|记者|文案|ライター|編集者|記者|작가|에디터|기자|redactor|redactora|periodista|escritor/i],
  ['software', /\b(?:software|engineer|engineering|developer|programmer|sre|devops|front[- ]?end|back[- ]?end|full[- ]?stack|ios|android|architect)\b|工程师|开发|程序员|前端|后端|エンジニア|開発者|개발자|엔지니어|ingenier[oa]|desarrollador|desarrolladora|programador/i],
];

/** The field a role's name points to, or null when it names none. */
export function fieldFromRole(text: string): InterviewField | null {
  return FIELD_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
