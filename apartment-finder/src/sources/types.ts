import type { RawListing, SearchCriteria, SourceName } from '../types';

export interface SourceResult {
  source: SourceName;
  listings: RawListing[];
  /** Non-fatal problems worth surfacing in the scan summary. */
  errors: string[];
}

export interface ListingSource {
  readonly name: SourceName;
  /**
   * Fetches current listings for the given criteria. Implementations should
   * fail soft: return whatever was gathered plus an error string, rather than
   * throwing, so one broken source cannot take down the whole morning scan.
   */
  fetch(criteria: SearchCriteria): Promise<SourceResult>;
}
