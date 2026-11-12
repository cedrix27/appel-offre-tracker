import { NotFoundException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant d'URL : non-UUID → 404 (pas de fuite d'information). */
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!uuidRegex.test(value)) {
      throw new NotFoundException('Ressource introuvable');
    }
    return value.toLowerCase();
  }
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide')
  .max(254);

export const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères')
  .max(128, 'Le mot de passe est trop long');

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Booléen de query string ('true'/'false'/'1'/'0'). */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const ymdSchemaRegex = /^\d{4}-\d{2}-\d{2}$/;
