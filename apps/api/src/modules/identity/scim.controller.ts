import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScimErrorFilter } from './scim-error.filter.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { ScimService, scimVersion, scimError } from './scim.service.js';

@Public()
@UseFilters(ScimErrorFilter)
@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scim: ScimService) {}
  @Get('ServiceProviderConfig')
  @Header('Content-Type', 'application/scim+json')
  config(@Headers('authorization') auth: string) {
    return this.discovery(auth, 'ServiceProviderConfig');
  }
  @Get('Schemas')
  @Header('Content-Type', 'application/scim+json')
  schemas(@Headers('authorization') auth: string) {
    return this.discovery(auth, 'Schemas');
  }
  @Get('ResourceTypes')
  @Header('Content-Type', 'application/scim+json')
  resources(@Headers('authorization') auth: string) {
    return this.discovery(auth, 'ResourceTypes');
  }
  @Get('Schemas/:id')
  @Header('Content-Type', 'application/scim+json')
  schema(@Headers('authorization') auth: string, @Param('id') id: string) {
    return this.discoveryResource(auth, 'Schemas', id);
  }
  @Get('ResourceTypes/:id')
  @Header('Content-Type', 'application/scim+json')
  resource(@Headers('authorization') auth: string, @Param('id') id: string) {
    return this.discoveryResource(auth, 'ResourceTypes', id);
  }
  private async discoveryResource(auth: string, category: string, id: string) {
    const actor = await this.scim.actor(auth);
    return this.scim.run(actor, false, false, async () => {
      const list = this.scim.discovery(category),
        resources = 'Resources' in list ? list.Resources : [];
      const found = (resources ?? []).find((r) => r.id === id);
      if (!found) throw scimError(404, 'Discovery resource not found');
      return found;
    });
  }
  private async discovery(auth: string, name: string) {
    const actor = await this.scim.actor(auth);
    return this.scim.run(actor, false, false, async () => this.scim.discovery(name));
  }
  @Get(':type')
  async list(
    @Headers('authorization') auth: string,
    @Param('type') type: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.type(type);
    res.type('application/scim+json');
    return this.scim.list(await this.scim.actor(auth), type, query);
  }
  @Get(':type/:id')
  async get(
    @Headers('authorization') auth: string,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.type(type);
    const result = await this.scim.get(await this.scim.actor(auth), type, id);
    res.type('application/scim+json').set('ETag', scimVersion(result)!);
    return result;
  }
  @Post(':type')
  async create(
    @Headers('authorization') auth: string,
    @Param('type') type: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.type(type);
    const result = await this.scim.create(await this.scim.actor(auth), type, body);
    res
      .type('application/scim+json')
      .set('ETag', scimVersion(result)!)
      .set('Location', result.meta.location);
    return result;
  }
  @Put(':type/:id')
  put(
    @Headers('authorization') auth: string,
    @Headers('if-match') match: string | undefined,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.change(auth, match, type, id, body, res, false);
  }
  @Patch(':type/:id')
  patch(
    @Headers('authorization') auth: string,
    @Headers('if-match') match: string | undefined,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.change(auth, match, type, id, body, res, true);
  }
  @Delete(':type/:id')
  @HttpCode(204)
  async remove(
    @Headers('authorization') auth: string,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.type(type);
    await this.scim.remove(await this.scim.actor(auth), type, id);
  }
  private async change(
    auth: string,
    match: string | undefined,
    type: string,
    id: string,
    body: unknown,
    res: Response,
    partial: boolean,
  ) {
    this.type(type);
    const result = await this.scim.change(
      await this.scim.actor(auth),
      type,
      id,
      body,
      match,
      partial,
    );
    res.type('application/scim+json').set('ETag', scimVersion(result)!);
    return result;
  }
  private type(type: string): asserts type is 'Users' | 'Groups' {
    if (type !== 'Users' && type !== 'Groups') throw scimError(404, 'Unsupported SCIM resource');
  }
}
