import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Database } from '@gp/db';
import { sql } from 'drizzle-orm';
import { DB } from '../../db/db.module.js';
import { Public } from '../auth/jwt-auth.guard.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', db: 'up' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
