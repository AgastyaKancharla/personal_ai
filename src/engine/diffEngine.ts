import {
  SourceOfTruthNAP,
  ScrapedListing,
  DirectoryAuditResult,
  FieldDiff,
  MatchStatus,
  DirectoryAuditStatus
} from '../types/nap';
import { NAPNormalizer } from './normalizer';

export class NAPDiffEngine {
  /**
   * Diffs a scraped directory listing against the source-of-truth NAP
   */
  static compare(
    directoryId: string,
    directoryName: string,
    source: SourceOfTruthNAP,
    scraped: ScrapedListing | null
  ): DirectoryAuditResult {
    const as_of = scraped?.as_of || new Date().toISOString();
    // If directory was searched but no listing was found
    if (!scraped || !scraped.listingUrl) {
      return {
        directoryId,
        directoryName,
        status: 'NOT_FOUND',
        diffs: [],
        overallConfidence: 0,
        errorMessage: 'Listing not found on target directory.',
        claimStatus: 'UNKNOWN', fromCache: false, as_of
      };
    }

    const diffs: FieldDiff[] = [];

    // 1. Business Name Diff
    const sourceNameNorm = NAPNormalizer.normalizeBusinessName(source.businessName || '');
    const foundNameNorm = NAPNormalizer.normalizeBusinessName(scraped.foundName || '');
    const nameSimilarity = NAPNormalizer.calculateSimilarity(sourceNameNorm, foundNameNorm);
    
    let nameStatus: MatchStatus = 'MISMATCH';
    let nameNotes = '';
    if (nameSimilarity === 100) {
      nameStatus = 'EXACT';
      nameNotes = 'Exact name match.';
    } else if (nameSimilarity >= 75) {
      nameStatus = 'DRIFT';
      nameNotes = `Minor name variation detected (Score: ${nameSimilarity}%).`;
    } else {
      nameStatus = 'MISMATCH';
      nameNotes = `Significant business name mismatch (Score: ${nameSimilarity}%).`;
    }

    diffs.push({
      fieldName: 'businessName',
      sourceValue: source.businessName || '',
      foundValue: scraped.foundName || '',
      matchStatus: nameStatus,
      similarityScore: nameSimilarity,
      notes: nameNotes
      ,as_of
    });

    // 2. Phone Number Diff
    const sourcePhoneNorm = NAPNormalizer.normalizePhone(source.phone || '');
    const foundPhoneNorm = NAPNormalizer.normalizePhone(scraped.foundPhone || '');
    const phoneSimilarity = sourcePhoneNorm === foundPhoneNorm ? 100 : 0;
    
    let phoneStatus: MatchStatus = 'MISMATCH';
    let phoneNotes = '';
    if (!scraped.foundPhone) {
      phoneStatus = 'MISSING';
      phoneNotes = 'Phone number missing on directory listing.';
    } else if (phoneSimilarity === 100) {
      phoneStatus = 'EXACT';
      phoneNotes = 'Phone number matches source of truth.';
    } else {
      phoneStatus = 'MISMATCH';
      phoneNotes = `Phone mismatch: source (${source.phone}) vs listing (${scraped.foundPhone}).`;
    }

    diffs.push({
      fieldName: 'phone',
      sourceValue: source.phone || '',
      foundValue: scraped.foundPhone || '',
      matchStatus: phoneStatus,
      similarityScore: phoneSimilarity,
      notes: phoneNotes
      ,as_of
    });

    // 3. Address Diff
    const sourceAddrNorm = NAPNormalizer.normalizeAddress(`${source.address || ''} ${source.city || ''}`.trim());
    const foundAddrNorm = NAPNormalizer.normalizeAddress(scraped.foundAddress || '');
    const addrSimilarity = NAPNormalizer.calculateSimilarity(sourceAddrNorm, foundAddrNorm);

    let addrStatus: MatchStatus = 'MISMATCH';
    let addrNotes = '';
    if (!scraped.foundAddress) {
      addrStatus = 'MISSING';
      addrNotes = 'Address missing on directory listing.';
    } else if (addrSimilarity >= 90) {
      addrStatus = 'EXACT';
      addrNotes = 'Address matches source of truth closely.';
    } else if (addrSimilarity >= 60) {
      addrStatus = 'DRIFT';
      addrNotes = `Address format drift detected (Similarity: ${addrSimilarity}%).`;
    } else {
      addrStatus = 'MISMATCH';
      addrNotes = `Address mismatch detected (Similarity: ${addrSimilarity}%).`;
    }

    diffs.push({
      fieldName: 'address',
      sourceValue: source.address || '',
      foundValue: scraped.foundAddress || '',
      matchStatus: addrStatus,
      similarityScore: addrSimilarity,
      notes: addrNotes
      ,as_of
    });

    // 4. Website Diff (Optional check)
    if (source.website || scraped.foundWebsite) {
      const sourceWeb = (source.website || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      const foundWeb = (scraped.foundWebsite || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      const webMatch = sourceWeb === foundWeb;
      const webScore = webMatch ? 100 : 0;

      diffs.push({
        fieldName: 'website',
        sourceValue: source.website || '',
        foundValue: scraped.foundWebsite || '',
        matchStatus: webMatch ? 'EXACT' : (scraped.foundWebsite ? 'MISMATCH' : 'MISSING'),
        similarityScore: webScore,
        notes: webMatch ? 'Website URL matches.' : 'Website URL differs or missing.'
        ,as_of
      });
    }

    const sourceCategory = (source.category || '').trim();
    const foundCategory = (scraped.foundCategory || '').trim();
    const categorySimilarity = NAPNormalizer.calculateSimilarity(sourceCategory, foundCategory);
    const categoryStatus: MatchStatus = !foundCategory ? 'MISSING' : categorySimilarity === 100 ? 'EXACT' : categorySimilarity >= 75 ? 'DRIFT' : 'MISMATCH';
    diffs.push({ fieldName: 'category', sourceValue: sourceCategory, foundValue: foundCategory, matchStatus: categoryStatus, similarityScore: categorySimilarity, notes: categoryStatus === 'MISMATCH' ? 'Category mismatch detected; review this high-impact ranking signal.' : categoryStatus === 'MISSING' ? 'Category missing on directory listing.' : 'Category comparison completed.', as_of });

    // Determine Overall Status
    const isNameOk = nameStatus === 'EXACT' || nameStatus === 'DRIFT';
    const isPhoneOk = phoneStatus === 'EXACT';
    const isAddrOk = addrStatus === 'EXACT' || addrStatus === 'DRIFT';

    let overallStatus: DirectoryAuditStatus = 'CONSISTENT';
    if (nameStatus === 'EXACT' && phoneStatus === 'EXACT' && addrStatus === 'EXACT') {
      overallStatus = 'CONSISTENT';
    } else if (isNameOk && isPhoneOk && isAddrOk) {
      overallStatus = 'DRIFT';
    } else {
      overallStatus = 'INCONSISTENT';
    }

    const overallConfidence = Math.round(
      (nameSimilarity * 0.4) + (phoneSimilarity * 0.4) + (addrSimilarity * 0.2)
    );

    return {
      directoryId,
      directoryName,
      status: overallStatus,
      listingUrl: scraped.listingUrl,
      diffs,
      overallConfidence,
      completeness: scraped.completeness,
      claimStatus: scraped.claimStatus || 'UNKNOWN',
      fromCache: false,
      as_of
    };
  }
}
