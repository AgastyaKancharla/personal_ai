export interface SourceOfTruthNAP {
  businessName?: string;
  address?: string;
  phone?: string;
  secondaryPhone?: string;
  city?: string;
  state?: string;
  pincode?: string;
  website?: string;
  category?: string;
  workingHours?: string;
}

export interface ScrapedListing {
  directoryId: string;
  directoryName: string;
  listingUrl?: string;
  foundName?: string;
  foundAddress?: string;
  foundPhone?: string;
  foundWebsite?: string;
  foundCategory?: string;
  completeness?: Completeness;
  claimStatus?: ClaimStatus;
  as_of?: string;
  rating?: string;
  reviewCount?: string;
  isClaimed?: boolean;
  rawData?: Record<string, any>;
}

export type MatchStatus = 'EXACT' | 'DRIFT' | 'MISMATCH' | 'MISSING';
export type ClaimStatus = 'CLAIMED' | 'UNCLAIMED' | 'UNKNOWN';

export interface Completeness {
  hoursPresent?: boolean;
  photosPresent?: boolean;
  descriptionPresent?: boolean;
  attributesPresent?: boolean;
  score: number;
}

export interface FieldDiff {
  fieldName: 'businessName' | 'address' | 'phone' | 'website' | 'category';
  sourceValue: string;
  foundValue: string;
  matchStatus: MatchStatus;
  similarityScore: number; // 0 to 100
  notes: string;
  as_of: string;
}

export type DirectoryAuditStatus =
  | 'CONSISTENT'
  | 'DRIFT'
  | 'INCONSISTENT'
  | 'NOT_FOUND'
  | 'ERROR'
  | 'DUPLICATE_FOUND'
  | 'LOW_CONFIDENCE_SOURCE';

export interface DirectoryAuditResult {
  directoryId: string;
  directoryName: string;
  status: DirectoryAuditStatus;
  listingUrl?: string;
  diffs: FieldDiff[];
  overallConfidence: number;
  errorMessage?: string;
  completeness?: Completeness;
  claimStatus: ClaimStatus;
  fromCache: boolean;
  as_of: string;
}

export interface NAPAuditReport {
  businessInfo: SourceOfTruthNAP;
  auditTimestamp: string;
  totalDirectoriesChecked: number;
  foundCount: number;
  missingCount: number;
  consistentCount: number;
  inconsistentCount: number;
  auditScore: number; // Percentage consistency score
  completenessScore: number;
  results: DirectoryAuditResult[];
  selectedClusters?: Array<{ id: string; status: 'PRIMARY_MATCH' | 'POSSIBLE_DUPLICATE_OR_OLD_LISTING'; businessName?: string }>;
}
