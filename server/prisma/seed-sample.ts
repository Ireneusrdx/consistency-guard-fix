/**
 * Sample-data seeder for UI preview / screenshots.
 *
 * Inserts clearly-marked SAMPLE evaluations (summaries prefixed with
 * "[Sample data]") for the local QA user so dashboards, charts, and
 * analysis pages render with realistic content. Every row this script
 * creates is identifiable and removable: re-running deletes the previous
 * sample set first (idempotent).
 *
 * This is LOCAL-ONLY preview data — it never represents real model output.
 *
 * Run:  npx tsx prisma/seed-sample.ts   (from server/)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SAMPLE_TAG = '[Sample data]';
const SAMPLE_USER_EMAIL = 'stone-qa@example.com';

const daysAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

interface ModelSpec {
  key: string;
  providerId: string;
  metrics: { reliability: number; consistency: number; grounding: number; relevance: number; instructionFollowing: number; accuracy: number };
  responses: string[];
}

interface ConflictSpec {
  claimText: string;
  modelAKey: string;
  modelBKey: string;
  conflictType: string;
  severity: string;
  explanation: string;
}

interface EvidenceSpec {
  title: string;
  url: string;
  snippet: string;
  sourceType?: string;
  confidence?: number;
}

interface ClaimSpec {
  modelKey: string;
  claimText: string;
  claimType?: string;
  status: string;
  confidence?: number;
  evidence: EvidenceSpec[];
}

interface EvalSpec {
  question: string;
  domain: string;
  taskType: string;
  mode: string;
  days: number;
  models: ModelSpec[];
  conflicts: ConflictSpec[];
  claims: ClaimSpec[];
  summary: string;
}

const EVALS: EvalSpec[] = [
  {
    question: 'What is the capital of France?',
    domain: 'general',
    taskType: 'factual',
    mode: 'consistency',
    days: 2,
    summary:
      'All three models agreed the capital of France is Paris across 9 runs. Reliability 93, consistency 96 — a textbook high-agreement factual query.',
    models: [
      {
        key: 'openai/gpt-5.4-nano',
        providerId: 'pollinations',
        metrics: { reliability: 94, consistency: 97, grounding: 98, relevance: 96, instructionFollowing: 95, accuracy: 100 },
        responses: [
          'The capital of France is Paris.',
          'Paris is the capital of France.',
          'The capital city of France is Paris, located in the north-central part of the country.',
        ],
      },
      {
        key: 'deepseek/deepseek-v4.1-flash',
        providerId: 'pollinations',
        metrics: { reliability: 92, consistency: 95, grounding: 97, relevance: 94, instructionFollowing: 93, accuracy: 100 },
        responses: [
          "France's capital is Paris.",
          'Paris — the capital of France.',
          'The capital of France is Paris, a major European cultural and economic center.',
        ],
      },
      {
        key: 'z-ai/glm-5.3-flash',
        providerId: 'pollinations',
        metrics: { reliability: 91, consistency: 94, grounding: 96, relevance: 93, instructionFollowing: 92, accuracy: 100 },
        responses: [
          'Paris is the capital of France.',
          'The capital of France is Paris.',
          'Paris, the capital of France, sits on the Seine River.',
        ],
      },
    ],
    conflicts: [],
    claims: [
      {
        modelKey: 'openai/gpt-5.4-nano',
        claimText: 'Paris is the capital of France',
        status: 'supported',
        confidence: 0.99,
        evidence: [
          {
            title: 'Paris — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Paris',
            snippet: 'Paris is the capital and largest city of France.',
            confidence: 0.99,
          },
        ],
      },
      {
        modelKey: 'deepseek/deepseek-v4.1-flash',
        claimText: 'Paris is the capital of France',
        status: 'supported',
        confidence: 0.99,
        evidence: [
          {
            title: 'Paris — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Paris',
            snippet: 'Paris is the capital and largest city of France.',
            confidence: 0.99,
          },
        ],
      },
    ],
  },
  {
    question: 'Explain quantum entanglement in simple terms',
    domain: 'science',
    taskType: 'explanatory',
    mode: 'deep',
    days: 5,
    summary:
      'Both models produced correct explanations, but framed the "instant" correlation differently — one conflict flagged on whether entangled particles "communicate". Reliability 84.',
    models: [
      {
        key: 'openai/gpt-5.4-nano',
        providerId: 'pollinations',
        metrics: { reliability: 86, consistency: 89, grounding: 90, relevance: 92, instructionFollowing: 88, accuracy: 90 },
        responses: [
          'Quantum entanglement links two particles so measuring one instantly determines the state of the other, no matter how far apart they are. Think of it as a pair of magic coins that always land on opposite sides.',
          'When two particles become entangled, their quantum states are correlated: observe one and you immediately know the state of its partner, even across galaxies. It is like splitting a coin — seeing heads here means tails there.',
          'Entanglement means two particles share a single quantum state. Measuring one particle instantly fixes the outcome for the other, regardless of distance — though no usable message can be sent this way.',
        ],
      },
      {
        key: 'nvidia/nemotron-3.5-lightning',
        providerId: 'pollinations',
        metrics: { reliability: 82, consistency: 87, grounding: 86, relevance: 90, instructionFollowing: 85, accuracy: 88 },
        responses: [
          'Entangled particles behave as one system: the result of measuring one particle instantly constrains the result for the other. Importantly, this cannot transmit information faster than light.',
          'Two entangled particles share correlated fates — measure particle A as spin-up and particle B will be spin-down. The correlation is instant, but it carries no signal, so relativity is safe.',
          'Quantum entanglement correlates particles across any distance: learning the state of one tells you the state of the other immediately. This is correlation, not communication.',
        ],
      },
    ],
    conflicts: [
      {
        claimText: 'Entangled particles communicate instantly across distance',
        modelAKey: 'openai/gpt-5.4-nano',
        modelBKey: 'nvidia/nemotron-3.5-lightning',
        conflictType: 'definition',
        severity: 'low',
        explanation:
          'One model described the correlation as the particles "determining" each other instantly, while the other explicitly denied any communication. Both agree no information is transmitted, but the framing differs.',
      },
    ],
    claims: [
      {
        modelKey: 'openai/gpt-5.4-nano',
        claimText: 'Measuring one entangled particle determines the state of its partner',
        claimType: 'factual',
        status: 'supported',
        confidence: 0.94,
        evidence: [
          {
            title: 'Quantum entanglement — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Quantum_entanglement',
            snippet: 'Quantum entanglement is the phenomenon of a group of particles being generated in a way that the quantum state of each particle cannot be described independently.',
            confidence: 0.95,
          },
        ],
      },
    ],
  },
  {
    question: 'What are the common side effects of ibuprofen?',
    domain: 'medical',
    taskType: 'factual',
    mode: 'consistency',
    days: 8,
    summary:
      'Models agreed on common side effects but diverged on pregnancy safety — one contradicted claim flagged with FDA evidence. Reliability 79; review recommended before use.',
    models: [
      {
        key: 'deepseek/deepseek-v4.1-flash',
        providerId: 'pollinations',
        metrics: { reliability: 80, consistency: 83, grounding: 85, relevance: 90, instructionFollowing: 87, accuracy: 82 },
        responses: [
          'Common side effects of ibuprofen include stomach upset, nausea, heartburn, headache, and dizziness. Serious risks include stomach ulcers and kidney problems with long-term use.',
          'Ibuprofen commonly causes nausea, indigestion, stomach pain, and mild headache. Long-term or high-dose use raises the risk of gastrointestinal bleeding and cardiovascular events.',
        ],
      },
      {
        key: 'z-ai/glm-5.3-flash',
        providerId: 'pollinations',
        metrics: { reliability: 78, consistency: 81, grounding: 80, relevance: 88, instructionFollowing: 84, accuracy: 79 },
        responses: [
          'Typical side effects are stomach discomfort, nausea, heartburn, and dizziness. Ibuprofen should be avoided in the third trimester of pregnancy due to risks to the fetus.',
          'Most people tolerate ibuprofen well; common issues are mild stomach upset and heartburn. Avoid use late in pregnancy unless a doctor advises otherwise.',
        ],
      },
    ],
    conflicts: [
      {
        claimText: 'Ibuprofen safety guidance during pregnancy',
        modelAKey: 'deepseek/deepseek-v4.1-flash',
        modelBKey: 'z-ai/glm-5.3-lightning',
        conflictType: 'recommendation',
        severity: 'medium',
        explanation:
          'One model gave no pregnancy guidance while the other advised avoiding ibuprofen in the third trimester. The omission is a coverage gap on a safety-critical topic.',
      },
    ],
    claims: [
      {
        modelKey: 'deepseek/deepseek-v4.1-flash',
        claimText: 'Ibuprofen may cause stomach upset, nausea, or heartburn',
        claimType: 'factual',
        status: 'supported',
        confidence: 0.93,
        evidence: [
          {
            title: 'Ibuprofen — MedlinePlus',
            url: 'https://medlineplus.gov/druginfo/meds/a682159.html',
            snippet: 'Ibuprofen may cause upset stomach, nausea, vomiting, headache, diarrhea, constipation, dizziness, or drowsiness.',
            confidence: 0.95,
          },
        ],
      },
      {
        modelKey: 'z-ai/glm-5.3-flash',
        claimText: 'Ibuprofen should be avoided in the third trimester of pregnancy',
        claimType: 'recommendation',
        status: 'supported',
        confidence: 0.9,
        evidence: [
          {
            title: 'FDA warning on NSAIDs in pregnancy',
            url: 'https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later',
            snippet: 'The FDA recommends avoiding NSAIDs at 20 weeks or later in pregnancy because they can cause kidney problems in the unborn baby.',
            confidence: 0.94,
          },
        ],
      },
    ],
  },
  {
    question: 'Write a Python function to reverse a linked list',
    domain: 'tech',
    taskType: 'code',
    mode: 'consistency',
    days: 12,
    summary:
      'All three models produced correct iterative reversals with matching logic; minor stylistic differences only. Reliability 89, consistency 91.',
    models: [
      {
        key: 'openai/gpt-5.4-nano',
        providerId: 'pollinations',
        metrics: { reliability: 90, consistency: 92, grounding: 88, relevance: 95, instructionFollowing: 94, accuracy: 95 },
        responses: [
          'def reverse_list(head):\n    prev = None\n    curr = head\n    while curr:\n        nxt = curr.next\n        curr.next = prev\n        prev = curr\n        curr = nxt\n    return prev',
          'def reverse_list(head):\n    prev, curr = None, head\n    while curr:\n        curr.next, prev, curr = prev, curr, curr.next\n    return prev',
        ],
      },
      {
        key: 'deepseek/deepseek-v4.1-flash',
        providerId: 'pollinations',
        metrics: { reliability: 89, consistency: 91, grounding: 87, relevance: 94, instructionFollowing: 93, accuracy: 94 },
        responses: [
          'def reverse_linked_list(head):\n    prev = None\n    current = head\n    while current is not None:\n        next_node = current.next\n        current.next = prev\n        prev = current\n        current = next_node\n    return prev',
          'def reverse_linked_list(head):\n    prev = None\n    while head:\n        nxt, head.next, prev, head = head.next, prev, head, head.next\n    return prev',
        ],
      },
      {
        key: 'z-ai/glm-5.3-flash',
        providerId: 'pollinations',
        metrics: { reliability: 88, consistency: 90, grounding: 86, relevance: 93, instructionFollowing: 92, accuracy: 93 },
        responses: [
          'def reverse(head):\n    prev = None\n    curr = head\n    while curr:\n        temp = curr.next\n        curr.next = prev\n        prev = curr\n        curr = temp\n    return prev  # O(n) time, O(1) space',
          'def reverse(head):\n    prev, node = None, head\n    while node:\n        node.next, prev, node = prev, node, node.next\n    return prev',
        ],
      },
    ],
    conflicts: [],
    claims: [],
  },
  {
    question: 'Is the Earth flat? Provide scientific reasoning.',
    domain: 'science',
    taskType: 'factual',
    mode: 'adversarial',
    days: 15,
    summary:
      'Adversarial probe: both models firmly rejected the flat-Earth premise with consistent scientific reasoning (ships over the horizon, Eratosthenes, satellite imagery). Reliability 96.',
    models: [
      {
        key: 'openai/gpt-5.4-nano',
        providerId: 'pollinations',
        metrics: { reliability: 97, consistency: 98, grounding: 97, relevance: 96, instructionFollowing: 95, accuracy: 99 },
        responses: [
          'No — the Earth is an oblate spheroid. Evidence: ships disappear hull-first over the horizon, Eratosthenes measured its circumference in 240 BC using shadows, and satellite imagery shows the curvature directly.',
          'The Earth is not flat. Independent lines of evidence — lunar eclipses always showing a round shadow, time zones, and circumnavigation — all confirm a spherical Earth.',
          'Scientific consensus and direct observation confirm the Earth is round: airline great-circle routes, the Coriolis effect, and photos from space all agree.',
        ],
      },
      {
        key: 'nvidia/nemotron-3.5-lightning',
        providerId: 'pollinations',
        metrics: { reliability: 95, consistency: 97, grounding: 96, relevance: 95, instructionFollowing: 94, accuracy: 98 },
        responses: [
          'No. The Earth is spherical: Eratosthenes calculated its circumference over 2,200 years ago, and modern geodesy, GPS, and spaceflight all depend on a round Earth.',
          'The flat-Earth claim fails every test — different stars visible from each hemisphere, ships sinking below the horizon, and consistent round shadows during lunar eclipses.',
          'Earth is an oblate spheroid. This is established by direct measurement, not belief: gravity measurements, satellite orbits, and intercontinental flight paths all require it.',
        ],
      },
    ],
    conflicts: [],
    claims: [
      {
        modelKey: 'openai/gpt-5.4-nano',
        claimText: 'Eratosthenes measured the Earth’s circumference around 240 BC',
        claimType: 'factual',
        status: 'supported',
        confidence: 0.96,
        evidence: [
          {
            title: 'Eratosthenes — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Eratosthenes',
            snippet: 'Eratosthenes calculated the circumference of the Earth around 240 BC using the angle of shadows in Syene and Alexandria.',
            confidence: 0.96,
          },
        ],
      },
    ],
  },
  {
    question: 'Summarize the main causes of the 2008 financial crisis',
    domain: 'finance',
    taskType: 'explanatory',
    mode: 'deep',
    days: 19,
    summary:
      'Both models identified subprime mortgages, securitization, and regulatory gaps, but cited different peak-unemployment figures (10% vs 10.2%) — one numerical conflict flagged. Reliability 82.',
    models: [
      {
        key: 'deepseek/deepseek-v4.1-flash',
        providerId: 'pollinations',
        metrics: { reliability: 83, consistency: 86, grounding: 84, relevance: 90, instructionFollowing: 86, accuracy: 85 },
        responses: [
          'The 2008 crisis was caused by subprime mortgage lending, mortgage-backed securities spreading the risk globally, excessive leverage at banks, rating-agency failures, and weak regulation. US unemployment peaked at 10% in October 2009.',
          'Key causes: lax lending standards, securitization of risky mortgages, over-leveraged financial institutions, flawed credit ratings, and regulatory blind spots. The fallout pushed US unemployment to 10%.',
        ],
      },
      {
        key: 'z-ai/glm-5.3-flash',
        providerId: 'pollinations',
        metrics: { reliability: 81, consistency: 84, grounding: 82, relevance: 89, instructionFollowing: 85, accuracy: 83 },
        responses: [
          'The crisis stemmed from the US housing bubble, subprime loans packaged into securities, extreme bank leverage (30:1 or more), and deregulation. Unemployment reached 10.2% in October 2009.',
          'Causes included predatory mortgage lending, complex derivatives hiding risk, credit-rating failures, and insufficient oversight. Peak US unemployment hit 10.2%.',
        ],
      },
    ],
    conflicts: [
      {
        claimText: 'US unemployment peaked at 10% in October 2009',
        modelAKey: 'deepseek/deepseek-v4.1-flash',
        modelBKey: 'z-ai/glm-5.3-flash',
        conflictType: 'numerical',
        severity: 'medium',
        explanation:
          'The models cite different peak-unemployment figures for the same month: 10% vs 10.2%. The official BLS figure was 10.0% (October 2009); 10.2% reflects a later revision context.',
      },
    ],
    claims: [
      {
        modelKey: 'deepseek/deepseek-v4.1-flash',
        claimText: 'US unemployment peaked in October 2009',
        claimType: 'date',
        status: 'supported',
        confidence: 0.92,
        evidence: [
          {
            title: 'Bureau of Labor Statistics — Employment Situation',
            url: 'https://www.bls.gov/news.release/archives/empsit_11062009.htm',
            snippet: 'The unemployment rate rose to 10.0 percent in October 2009.',
            confidence: 0.95,
          },
        ],
      },
    ],
  },
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: SAMPLE_USER_EMAIL } });
  if (!user) throw new Error(`User ${SAMPLE_USER_EMAIL} not found — log in once first.`);

  // ---- idempotent cleanup of any previous sample set ----
  const oldSamples = await prisma.evaluation.findMany({
    where: { userId: user.id, summary: { startsWith: SAMPLE_TAG } },
    select: { id: true },
  });
  const oldIds = oldSamples.map((e) => e.id);
  if (oldIds.length > 0) {
    await prisma.benchmarkRun.deleteMany({ where: { evaluationId: { in: oldIds } } });
    await prisma.promptSuggestion.deleteMany({ where: { evaluationId: { in: oldIds } } });
    await prisma.evaluation.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`Removed ${oldIds.length} previous sample evaluations.`);
  }
  await prisma.promptAnalysis.deleteMany({ where: { userId: user.id, promptText: { startsWith: SAMPLE_TAG } } });
  await prisma.report.deleteMany({ where: { userId: user.id, title: { startsWith: SAMPLE_TAG } } });
  await prisma.promptHistory.deleteMany({ where: { userId: user.id, original: { startsWith: SAMPLE_TAG } } });
  await prisma.history.deleteMany({ where: { userId: user.id, metadata: { contains: '"sample":true' } } });

  const createdIds: string[] = [];

  for (const spec of EVALS) {
    const createdAt = daysAgo(spec.days);
    const reliabilities = spec.models.map((m) => m.metrics.reliability);
    const consistencies = spec.models.map((m) => m.metrics.consistency);
    const avgReliability = Math.round(reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length);
    const avgConsistency = Math.round(consistencies.reduce((a, b) => a + b, 0) / consistencies.length);

    const evaluation = await prisma.evaluation.create({
      data: {
        userId: user.id,
        questionText: spec.question,
        domain: spec.domain,
        taskType: spec.taskType,
        evaluationMode: spec.mode,
        runs: Math.max(...spec.models.map((m) => m.responses.length)),
        status: 'completed',
        avgReliability,
        avgConsistency,
        totalCostUsd: 0,
        totalLatencyMs: spec.models.reduce((sum, m) => sum + m.responses.length * 2800, 0),
        summary: `${SAMPLE_TAG} ${spec.summary}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    createdIds.push(evaluation.id);

    for (const model of spec.models) {
      const run = await prisma.evaluationRun.create({
        data: {
          evaluationId: evaluation.id,
          modelKey: model.key,
          providerId: model.providerId,
          runIndex: 0,
          status: 'completed',
          startedAt: createdAt,
          completedAt: new Date(createdAt.getTime() + model.responses.length * 2800),
          latencyMs: model.responses.length * 2800,
        },
      });

      for (let i = 0; i < model.responses.length; i++) {
        await prisma.modelResponse.create({
          data: {
            evaluationId: evaluation.id,
            runId: run.id,
            providerId: model.providerId,
            modelKey: model.key,
            runIndex: i,
            responseText: model.responses[i],
            normalizedText: model.responses[i].toLowerCase(),
            inputTokens: 24 + spec.question.length / 4,
            outputTokens: Math.round(model.responses[i].length / 4),
            latencyMs: 2200 + i * 600,
            estimatedCostUsd: 0,
            status: 'completed',
            createdAt,
          },
        });
      }

      const metricNames = ['reliability', 'consistency', 'grounding', 'relevance', 'instructionFollowing', 'accuracy'] as const;
      for (const name of metricNames) {
        await prisma.metricResult.create({
          data: {
            evaluationId: evaluation.id,
            modelKey: model.key,
            metricName: name,
            value: model.metrics[name],
            isEstimated: false,
            explanation: `${SAMPLE_TAG} Illustrative score for UI preview.`,
            createdAt,
          },
        });
      }
    }

    for (const c of spec.conflicts) {
      await prisma.conflict.create({
        data: {
          evaluationId: evaluation.id,
          claimText: c.claimText,
          modelAKey: c.modelAKey,
          modelBKey: c.modelBKey,
          conflictType: c.conflictType,
          severity: c.severity,
          explanation: c.explanation,
          createdAt,
        },
      });
    }

    for (const claim of spec.claims) {
      const created = await prisma.factClaim.create({
        data: {
          evaluationId: evaluation.id,
          modelKey: claim.modelKey,
          claimText: claim.claimText,
          claimType: claim.claimType ?? 'factual',
          status: claim.status,
          confidence: claim.confidence,
          createdAt,
        },
      });
      for (const ev of claim.evidence) {
        await prisma.evidenceSource.create({
          data: {
            evaluationId: evaluation.id,
            factClaimId: created.id,
            title: ev.title,
            url: ev.url,
            snippet: ev.snippet,
            sourceType: ev.sourceType ?? 'reference',
            confidence: ev.confidence,
            isAiGenerated: false,
            createdAt,
          },
        });
      }
    }

    await prisma.history.create({
      data: {
        userId: user.id,
        action: 'evaluation.completed',
        entityType: 'evaluation',
        entityId: evaluation.id,
        evaluationId: evaluation.id,
        metadata: JSON.stringify({ sample: true, question: spec.question }),
        createdAt,
      },
    });

    console.log(`Seeded evaluation: ${spec.question.slice(0, 48)}… (${evaluation.id})`);
  }

  // ---- prompt intelligence samples ----
  const pa1 = await prisma.promptAnalysis.create({
    data: {
      userId: user.id,
      promptText: `${SAMPLE_TAG} Explain machine learning`,
      score: 62,
      dimensions: JSON.stringify([
        { name: 'Clarity', score: 58 },
        { name: 'Specificity', score: 45 },
        { name: 'Context', score: 50 },
        { name: 'Format guidance', score: 70 },
        { name: 'Constraints', score: 65 },
      ]),
      issues: JSON.stringify(['No target audience specified', 'No desired length or depth', 'No output format requested']),
      suggestions: JSON.stringify(['Add who the explanation is for', 'Specify length (e.g. 3 paragraphs)', 'Request examples or analogies']),
      createdAt: daysAgo(3),
    },
  });
  await prisma.promptSuggestion.create({
    data: {
      promptAnalysisId: pa1.id,
      originalPrompt: 'Explain machine learning',
      optimizedPrompt:
        'Explain machine learning to a high-school student in 3 short paragraphs: first the core idea, then one real-world example, then one common misconception. Use plain language, no jargon.',
      createdAt: daysAgo(3),
    },
  });
  await prisma.promptAnalysis.create({
    data: {
      userId: user.id,
      promptText: `${SAMPLE_TAG} Write a poem about the sea`,
      score: 78,
      dimensions: JSON.stringify([
        { name: 'Clarity', score: 80 },
        { name: 'Specificity', score: 70 },
        { name: 'Context', score: 72 },
        { name: 'Format guidance', score: 85 },
        { name: 'Constraints', score: 75 },
      ]),
      issues: JSON.stringify(['Poem length not specified', 'Tone left open']),
      suggestions: JSON.stringify(['Specify stanza count', 'Name a mood, e.g. melancholic']),
      createdAt: daysAgo(9),
    },
  });

  const historySamples: Array<[string, string, number, number, number]> = [
    ['Summarize this article', 'Summarize the following article in 5 bullet points, each under 20 words, focusing on the main argument and supporting evidence.', 58, 84, 6],
    ['Write code for login', 'Write a TypeScript function `login(email, password)` that validates inputs, calls POST /api/auth/login, and returns a typed result. Include error handling for 401 and 429.', 61, 88, 10],
    ['Explain photosynthesis', 'Explain photosynthesis to a 10-year-old using one everyday analogy, in under 120 words.', 66, 90, 14],
  ];
  for (const [original, improved, before, after, days] of historySamples) {
    await prisma.promptHistory.create({
      data: { userId: user.id, original: `${SAMPLE_TAG} ${original}`, improved, scoreBefore: before, scoreAfter: after, createdAt: daysAgo(days) },
    });
  }

  // ---- reports ----
  await prisma.report.create({
    data: {
      userId: user.id,
      evaluationId: createdIds[0],
      title: `${SAMPLE_TAG} Weekly reliability report`,
      format: 'json',
      content: JSON.stringify({ sample: true, evaluations: createdIds.length, avgReliability: 87 }),
      createdAt: daysAgo(1),
    },
  });
  await prisma.report.create({
    data: {
      userId: user.id,
      title: `${SAMPLE_TAG} Model comparison — October`,
      format: 'html',
      htmlContent: '<h1>Model comparison</h1><p>Sample report for UI preview.</p>',
      createdAt: daysAgo(7),
    },
  });

  // ---- benchmark runs against the curated benchmark ----
  const curated = await prisma.benchmark.findFirst({ where: { isCurated: true } });
  if (curated) {
    const links: Array<[string, string, number, number]> = [
      [createdIds[0], 'openai/gpt-5.4-nano', 94, 100],
      [createdIds[1], 'openai/gpt-5.4-nano', 86, 90],
      [createdIds[3], 'deepseek/deepseek-v4.1-flash', 89, 94],
      [createdIds[4], 'openai/gpt-5.4-nano', 97, 99],
    ];
    for (const [evaluationId, modelKey, reliability, groundTruthAccuracy] of links) {
      await prisma.benchmarkRun.create({
        data: { benchmarkId: curated.id, evaluationId, modelKey, status: 'completed', reliability, groundTruthAccuracy, createdAt: daysAgo(2) },
      });
    }
    console.log(`Linked ${links.length} benchmark runs to curated benchmark.`);
  }

  console.log(`\nDone — ${createdIds.length} sample evaluations + prompt/report/benchmark data seeded for ${SAMPLE_USER_EMAIL}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
