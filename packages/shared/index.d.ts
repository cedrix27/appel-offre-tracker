export type Sector = { code: string; label: string; keywords: string[] };
export type Taxonomy = { version: number; sectors: Sector[]; procedureTypes: string[]; zones: string[] };
export declare const taxonomy: Taxonomy;
export declare const tenderExtractionSchema: Record<string, unknown>;
