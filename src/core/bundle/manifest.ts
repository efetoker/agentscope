import type { AgentscopeWarning } from '../warnings.js';

export type RepoStatus = 'detected' | 'inferred' | 'unavailable';
export type PathStatus = 'exact' | 'partial' | 'unavailable';

export interface BundleManifest {
  runtime: string;
  resolvedRootSessionId: string;
  requestedId?: string;
  requestedQuery?: string;
  includedSessionIds: string[];
  queriedSources: string[];
  payloadFiles: string[];
  warnings: AgentscopeWarning[];
  generatedAt: string;
  repo?: {
    value?: string;
    status: RepoStatus;
  };
  path?: {
    value?: string;
    status: PathStatus;
  };
}

export interface BundlePayloadFile {
  relativePath: string;
  content: string | Uint8Array;
}

export interface MaterializeBundleInput {
  runtime: string;
  resolvedRootSessionId: string;
  requestedId?: string;
  requestedQuery?: string;
  includedSessionIds?: string[];
  queriedSources?: string[];
  payloadFiles: BundlePayloadFile[];
  warnings: AgentscopeWarning[];
  repo?: BundleManifest['repo'];
  path?: BundleManifest['path'];
}
