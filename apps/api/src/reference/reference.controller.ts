import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PROCEDURE_TYPES, SECTORS, ZONES } from './taxonomy';

@Controller('reference')
export class ReferenceController {
  @Public()
  @Get('taxonomy')
  taxonomy() {
    return {
      sectors: SECTORS.map((s) => ({ code: s.code, label: s.label })),
      procedureTypes: PROCEDURE_TYPES,
      zones: ZONES,
    };
  }
}
