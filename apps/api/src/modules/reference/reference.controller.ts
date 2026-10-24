import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BD_DIVISIONS, type Division } from '@gp/shared';
import { Public } from '../auth/jwt-auth.guard.js';

/** Static reference data for forms. Public: it is the same for everyone. */
@ApiTags('reference')
@Public()
@Controller('reference')
export class ReferenceController {
  @Get('bd/divisions')
  divisions(): readonly Division[] {
    return BD_DIVISIONS;
  }
}

@Module({ controllers: [ReferenceController] })
export class ReferenceModule {}
