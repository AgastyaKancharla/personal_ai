import { NAPAuditReport } from '../types/nap';

export class NAPReporter {
  /**
   * Converts a NAPAuditReport object into an executive Markdown report.
   */
  static generateMarkdownReport(report: NAPAuditReport): string {
    const { businessInfo, auditScore, results } = report;

    let md = `# Local Citation & NAP Audit Report\n\n`;
    md += `**Business Name:** ${businessInfo.businessName}\n`;
    md += `**Address:** ${businessInfo.address}, ${businessInfo.city}\n`;
    md += `**Target Phone:** ${businessInfo.phone}\n`;
    md += `**Category:** ${businessInfo.category}\n`;
    md += `**Audit Timestamp:** ${report.auditTimestamp}\n`;
    md += `**Overall Citation Health Score:** **${auditScore}%**\n\n`;
    md += `**Listing Completeness Score:** **${Math.round(report.completenessScore * 100)}%**\n\n`;

    md += `| Metric | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| Directories Audited | ${report.totalDirectoriesChecked} |\n`;
    md += `| Consistent Listings | ${report.consistentCount} |\n`;
    md += `| Minor Format Drift | ${report.results.filter(r => r.status === 'DRIFT').length} |\n`;
    md += `| Inconsistent / Mismatched | ${report.inconsistentCount} |\n`;
    md += `| Missing Listings | ${report.missingCount} |\n\n`;

    md += `--- \n\n`;
    md += `## Detailed Directory Breakdown\n\n`;

    for (const res of results) {
      const statusIcon = res.status === 'CONSISTENT' ? '✅' : res.status === 'DRIFT' ? '⚠️' : res.status === 'INCONSISTENT' ? '❌' : '🔍';
      md += `### ${statusIcon} ${res.directoryName} (${res.status})\n`;
      if (res.listingUrl) {
        md += `**URL:** [View Listing](${res.listingUrl})\n\n`;
      }

      if (res.diffs.length > 0) {
        md += `| Field | Source of Truth | Found Value | Match Status | Notes |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- |\n`;
        for (const diff of res.diffs) {
          const diffIcon = diff.matchStatus === 'EXACT' ? '✅' : diff.matchStatus === 'DRIFT' ? '⚠️' : '❌';
          md += `| **${diff.fieldName}** | ${diff.sourceValue} | ${diff.foundValue || '*(missing)*'} | ${diffIcon} ${diff.matchStatus} | ${diff.notes} |\n`;
        }
        md += `\n`;
      } else {
        md += `*No active listing detected on ${res.directoryName}. Recommended for Phase 2 Submission.*\n\n`;
      }
    }

    md += `--- \n\n`;
    md += `### 💡 Recommended Action Items\n`;
    md += `1. **Fix Inconsistent Phones & Addresses**: Update listings with '❌ MISMATCH' or '⚠️ DRIFT' to ensure 100% NAP consistency for Google Local Pack ranking.\n`;
    md += `2. **Correct Category Mismatches**: Review every category mismatch promptly; primary category accuracy is a high-impact local ranking signal.\n`;
    md += `3. **Submit to Missing Directories**: Pre-fill registration forms on missing directories to expand citation authority.\n`;

    return md;
  }
}
