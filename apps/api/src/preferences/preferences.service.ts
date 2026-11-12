import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WatchPreference } from '@prisma/client';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePreferenceInput,
  UpdatePreferenceInput,
} from './preferences.schemas';

export function toPreferenceDto(p: WatchPreference) {
  return {
    id: p.id,
    name: p.name,
    sectors: p.sectors,
    keywordsInclude: p.keywordsInclude,
    keywordsExclude: p.keywordsExclude,
    procedureTypes: p.procedureTypes,
    regions: p.regions,
    budgetMin: p.budgetMin === null ? null : Number(p.budgetMin),
    budgetMax: p.budgetMax === null ? null : Number(p.budgetMax),
    minScore: p.minScore,
    recipients: p.recipients,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const toBig = (v: number | null | undefined) =>
  v === undefined ? undefined : v === null ? null : BigInt(v);

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  async list(companyId: string) {
    const prefs = await this.prisma.watchPreference.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return prefs.map(toPreferenceDto);
  }

  private async findOwned(
    companyId: string,
    id: string,
  ): Promise<WatchPreference> {
    const pref = await this.prisma.watchPreference.findFirst({
      where: { id, companyId },
    });
    if (!pref) throw new NotFoundException('Préférence introuvable');
    return pref;
  }

  async create(companyId: string, input: CreatePreferenceInput) {
    const pref = await this.prisma.watchPreference.create({
      data: {
        ...input,
        companyId,
        budgetMin: toBig(input.budgetMin),
        budgetMax: toBig(input.budgetMax),
      },
    });
    await this.matching.rematchCompany(companyId);
    return toPreferenceDto(pref);
  }

  async update(companyId: string, id: string, input: UpdatePreferenceInput) {
    const current = await this.findOwned(companyId, id);
    const merged = {
      sectors: input.sectors ?? current.sectors,
      keywordsInclude: input.keywordsInclude ?? current.keywordsInclude,
      budgetMin:
        input.budgetMin === undefined ? current.budgetMin : input.budgetMin,
      budgetMax:
        input.budgetMax === undefined ? current.budgetMax : input.budgetMax,
    };
    if (merged.sectors.length === 0 && merged.keywordsInclude.length === 0) {
      throw new BadRequestException({
        message: 'Choisissez au moins un secteur ou un mot-clé',
        code: 'VALIDATION_ERROR',
      });
    }
    if (
      merged.budgetMin !== null &&
      merged.budgetMax !== null &&
      Number(merged.budgetMin) > Number(merged.budgetMax)
    ) {
      throw new BadRequestException({
        message:
          'Le budget minimum doit être inférieur ou égal au budget maximum',
        code: 'VALIDATION_ERROR',
      });
    }
    const pref = await this.prisma.watchPreference.update({
      where: { id: current.id },
      data: {
        ...input,
        budgetMin: toBig(input.budgetMin),
        budgetMax: toBig(input.budgetMax),
      },
    });
    await this.matching.rematchCompany(companyId);
    return toPreferenceDto(pref);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const pref = await this.findOwned(companyId, id);
    await this.prisma.watchPreference.delete({ where: { id: pref.id } });
  }
}
