import { SourceOfTruthNAP, DirectoryAuditResult, NAPAuditReport } from './types/nap';
import { getAllDirectoryProviders } from './directories';
import { NAPDiffEngine } from './engine/diffEngine';
import { NAPReporter } from './reports/reporter';
import { getCachedScan, setCachedScan } from './discovery/scanCache';
import { checkAdapterHealth, recordAdapterOutcome } from './directories/health';
import { statusMessageFor } from './audit/messages';

export interface AuditProgressEvent {
  type: 'status' | 'finding' | 'directory_done';
  message: string;
  directory: string;
  detail?: unknown;
  status?: string;
}

export class CitationAuditAgent {
  async runAudit(
    source: SourceOfTruthNAP,
    options?: { directoryIds?: string[]; onEvent?: (event: AuditProgressEvent) => void }
  ): Promise<NAPAuditReport> {
    console.log(`\n======================================================`);
    console.log(`🏥 Starting Local Citation & NAP Audit for: ${source.businessName}`);
    console.log(`📍 City: ${source.city} | Category: ${source.category}`);
    console.log(`======================================================\n`);

    const requestedDirectoryIds = options?.directoryIds;
    const providers = getAllDirectoryProviders().filter((provider) =>
      !requestedDirectoryIds || requestedDirectoryIds.includes(provider.directoryId)
    );
    const results: DirectoryAuditResult[] = [];

    for (const provider of providers) {
      console.log(`🔍 Auditing directory: ${provider.directoryName}...`);
      try {
        const cached = getCachedScan(source, provider.directoryId);
        options?.onEvent?.({ type: 'status', directory: provider.directoryId, message: statusMessageFor({ type: cached ? 'cache' : 'start', directoryName: provider.directoryName }) });
        const auditResult = cached || NAPDiffEngine.compare(provider.directoryId, provider.directoryName, source, await provider.searchAndScrape(source));
        if (!cached) setCachedScan(source, auditResult);
        if ((auditResult.status === 'NOT_FOUND' || auditResult.status === 'ERROR') && !checkAdapterHealth(provider.directoryId)) auditResult.status = 'LOW_CONFIDENCE_SOURCE';
        recordAdapterOutcome(provider.directoryId, auditResult.status);
        results.push(auditResult);
        auditResult.diffs.filter((diff) => diff.matchStatus !== 'EXACT').forEach((diff) => options?.onEvent?.({ type: 'finding', directory: provider.directoryId, message: `${diff.fieldName} differs on ${provider.directoryName}`, detail: diff }));
        options?.onEvent?.({ type: 'directory_done', directory: provider.directoryId, message: statusMessageFor({ type: 'done', directoryName: provider.directoryName, result: auditResult }), status: auditResult.status });
        console.log(`   └─ Status: ${auditResult.status} (Confidence: ${auditResult.overallConfidence}%)\n`);
      } catch (err: any) {
        console.error(`   └─ Failed to audit ${provider.directoryName}:`, err.message);
        results.push({
          directoryId: provider.directoryId,
          directoryName: provider.directoryName,
          status: 'ERROR',
          diffs: [],
          overallConfidence: 0,
          errorMessage: err.message,
          claimStatus: 'UNKNOWN', fromCache: false, as_of: new Date().toISOString()
        });
        options?.onEvent?.({ type: 'directory_done', directory: provider.directoryId, message: `${provider.directoryName} could not be checked.`, status: 'ERROR' });
      }
    }

    // Compute summary metrics
    const totalChecked = results.length;
    const foundCount = results.filter(r => r.status !== 'NOT_FOUND' && r.status !== 'ERROR').length;
    const missingCount = results.filter(r => r.status === 'NOT_FOUND').length;
    const consistentCount = results.filter(r => r.status === 'CONSISTENT').length;
    const inconsistentCount = results.filter(r => r.status === 'INCONSISTENT' || r.status === 'DRIFT').length;

    const totalConfidence = results.reduce((acc, curr) => acc + curr.overallConfidence, 0);
    const auditScore = Math.round(totalConfidence / (totalChecked || 1));
    const completenessScore = results.filter((result) => result.completeness).reduce((total, result, _, values) => total + (result.completeness?.score || 0) / values.length, 0);

    const report: NAPAuditReport = {
      businessInfo: source,
      auditTimestamp: new Date().toISOString(),
      totalDirectoriesChecked: totalChecked,
      foundCount,
      missingCount,
      consistentCount,
      inconsistentCount,
      auditScore,
      completenessScore,
      results
    };

    return report;
  }
}

// Default CLI demo execution
if (require.main === module) {
  const sampleClinic: SourceOfTruthNAP = {
    businessName: 'Nissa Dental Clinic & Implant Center',
    address: 'No. 45, 100 Feet Road, 4th Block, Koramangala',
    city: 'Bengaluru',
    pincode: '560034',
    phone: '08098765432',
    category: 'Dental Clinic',
    website: 'https://nissadental.com'
  };

  const agent = new CitationAuditAgent();
  agent.runAudit(sampleClinic).then((report) => {
    const markdown = NAPReporter.generateMarkdownReport(report);
    console.log(markdown);
  });
}
