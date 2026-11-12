#!/usr/bin/env node
/*
 * Faux collecteur pour les tests e2e (remplace `python -m collector run-job <id>`).
 * Usage : node fake-collector.js <jobId>
 * COLLECTOR_FAKE_MODE :
 *   success (défaut) — publication + 3 avis réalistes (champs absents = null), job DONE ;
 *   fail             — run FAILED + job FAILED écrits par le collecteur, code retour 1 ;
 *   crash            — sortie immédiate code 3 sans rien écrire (l'API doit consigner l'échec).
 */
const { PrismaClient } = require('@prisma/client');

const DAY = 24 * 3600 * 1000;

function tenders(now) {
  return [
    {
      contentHash: 'fake-e2e-9990-avis-01',
      title: "Acquisition de matériel informatique au profit de la Direction générale des impôts",
      reference: 'DPX n°2026-045/MEF/SG/DMP',
      organization: 'Direction générale des impôts',
      description:
        "Acquisition d'ordinateurs portables, d'imprimantes laser et d'onduleurs pour les services centraux de la DGI.",
      categories: ['Fournitures et services courants'],
      sectors: ['informatique'],
      procedureType: 'Demande de prix',
      location: 'Ouagadougou',
      publicationDate: new Date('2026-10-21T00:00:00Z'),
      submissionDeadline: new Date(now + 12 * DAY),
      deadlineHasTime: true,
      estimatedBudget: 25000000n,
      budgetTaxBasis: 'TTC',
      fundingSource: 'Budget de l’État, exercice 2026',
      summary: 'Achat de matériel informatique (ordinateurs, imprimantes, onduleurs) pour la DGI.',
      missingOrUncertainFields: [],
      sourcePages: [32, 33],
      evidence: { reference: 'Demande de prix n°2026-045/MEF/SG/DMP' },
    },
    {
      contentHash: 'fake-e2e-9990-avis-02',
      title: 'Travaux de réalisation de forages positifs équipés de pompes à motricité humaine',
      reference: null,
      organization: "Agence de l'eau du Nakanbé",
      description: 'Réalisation de dix forages positifs et réhabilitation de pompes dans plusieurs communes.',
      categories: ['Travaux'],
      sectors: ['hydraulique'],
      procedureType: "Appel d'offres ouvert",
      location: null,
      publicationDate: new Date('2026-10-21T00:00:00Z'),
      submissionDeadline: null,
      deadlineHasTime: false,
      estimatedBudget: null,
      budgetTaxBasis: null,
      fundingSource: null,
      summary: null,
      missingOrUncertainFields: ['reference', 'location', 'submission_deadline', 'estimated_budget'],
      sourcePages: [36],
      evidence: {},
    },
    {
      contentHash: 'fake-e2e-9990-avis-03',
      title: 'Entretien et nettoyage des locaux de la mairie de Bobo-Dioulasso',
      reference: 'DPX n°2026-012/CBD/SG',
      organization: 'Commune de Bobo-Dioulasso',
      description: 'Prestations de nettoyage et d’entretien des bâtiments administratifs de la commune.',
      categories: ['Prestations de services'],
      sectors: ['nettoyage_securite'],
      procedureType: 'Demande de prix',
      location: 'Bobo-Dioulasso',
      publicationDate: new Date('2026-10-21T00:00:00Z'),
      submissionDeadline: new Date(now + 20 * DAY),
      deadlineHasTime: false,
      estimatedBudget: null,
      budgetTaxBasis: null,
      fundingSource: null,
      summary: 'Nettoyage des locaux de la mairie de Bobo-Dioulasso.',
      missingOrUncertainFields: ['submission_time'],
      sourcePages: [40],
      evidence: {},
    },
  ];
}

async function main() {
  const jobId = process.argv[2];
  const mode = process.env.COLLECTOR_FAKE_MODE || 'success';
  if (!jobId) {
    console.error('usage : fake-collector <jobId>');
    process.exit(2);
  }
  if (mode === 'crash') {
    console.error('Traceback (most recent call last): RuntimeError: erreur simulée');
    process.exit(3);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const job = await prisma.collectorJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    const run = await prisma.sourceRun.create({
      data: { sourceId: job.sourceId, jobId: job.id, outcome: 'RUNNING' },
    });

    if (mode === 'fail') {
      const message = 'Source indisponible : HTTP 503 sur la liste des quotidiens';
      await prisma.sourceRun.update({
        where: { id: run.id },
        data: { outcome: 'FAILED', finishedAt: new Date(), errorMessage: message },
      });
      await prisma.collectorJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', lastError: message, finishedAt: new Date() },
      });
      process.exitCode = 1;
      return;
    }

    const source = await prisma.source.findUniqueOrThrow({ where: { id: job.sourceId } });
    const publication = await prisma.sourcePublication.upsert({
      where: { sourceId_externalRef: { sourceId: source.id, externalRef: 'Quotidien n°9990 (test e2e)' } },
      create: {
        sourceId: source.id,
        externalRef: 'Quotidien n°9990 (test e2e)',
        title: 'Quotidien des marchés publics n°9990 (test e2e)',
        publicationDate: new Date('2026-10-21T00:00:00Z'),
        pageUrl: source.baseUrl,
        fileUrl: 'https://www.dgcmef.gov.bf/images/quotidiens/quotidien-9990-test.pdf',
        sha256: 'f'.repeat(64),
        pageCount: 48,
        parsedAt: new Date(),
      },
      update: { parsedAt: new Date() },
    });

    let created = 0;
    const now = Date.now();
    for (const t of tenders(now)) {
      const existing = await prisma.tender.findUnique({ where: { contentHash: t.contentHash } });
      if (existing) {
        await prisma.tender.update({
          where: { id: existing.id },
          data: { lastVerifiedAt: new Date() },
        });
        continue;
      }
      await prisma.tender.create({
        data: {
          ...t,
          sourceId: source.id,
          publicationId: publication.id,
          sourceUrl: publication.fileUrl,
          rawText: `${t.title}\n${t.description ?? ''}`,
          extractionModel: 'rules:v1',
          extractedAt: new Date(),
        },
      });
      created += 1;
    }
    await prisma.sourceRun.update({
      where: { id: run.id },
      data: {
        outcome: created > 0 ? 'SUCCESS_NEW' : 'SUCCESS_NONE',
        finishedAt: new Date(),
        publicationsFound: 1,
        itemsFound: 3,
        itemsNew: created,
        itemsUpdated: 3 - created,
      },
    });
    await prisma.collectorJob.update({
      where: { id: job.id },
      data: { status: 'DONE', finishedAt: new Date() },
    });
    await prisma.source.update({ where: { id: source.id }, data: { lastSuccessAt: new Date() } });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
