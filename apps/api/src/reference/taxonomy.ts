import { taxonomy } from '@src/shared';

export const SECTORS = taxonomy.sectors;
export const SECTOR_CODES = taxonomy.sectors.map((s) => s.code);
export const PROCEDURE_TYPES = taxonomy.procedureTypes;
export const ZONES = taxonomy.zones;

const labels = new Map(taxonomy.sectors.map((s) => [s.code, s.label]));
export function sectorLabel(code: string): string {
  return labels.get(code) ?? code;
}
