import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateLetterDto,
  ListLettersQueryDto,
  TransitionLetterDto,
  UpdateLetterDto,
} from './dto/letters.dto';
import { LettersService, type WriteContext } from './letters.service';

/**
 * Persuratan — modul Fase 4.
 *
 * | Rute | Penjagaan |
 * |---|---|
 * | `GET /letters*` | `letter:read` |
 * | `POST · PATCH /letters*` | `letter:write` |
 * | `DELETE /letters/:id` | `letter:delete` |
 *
 * Izin baris (siapa boleh mengubah surat ini) diperiksa di service lewat
 * `canEditLetter`. Guard hanya memeriksa peran.
 */
@Controller('letters')
export class LettersController {
  constructor(private readonly letters: LettersService) {}

  @Get()
  @Policy('letter:read')
  list(@Query() query: ListLettersQueryDto) {
    return this.letters.list(query);
  }

  @Get(':id')
  @Policy('letter:read')
  detail(@Param('id') id: string, @Req() req: Request) {
    return this.letters.detail(id, this.actor(req));
  }

  @Post()
  @Policy('letter:write')
  create(@Body() dto: CreateLetterDto, @Req() req: Request) {
    return this.letters.create(dto, this.context(req));
  }

  @Patch(':id')
  @Policy('letter:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLetterDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.letters.update(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('letter:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionLetterDto,
    @Req() req: Request,
  ) {
    return this.letters.transition(id, dto, this.actor(req), this.context(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('letter:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.letters.remove(id, this.context(req));
  }

  private context(req: Request): WriteContext {
    return {
      actorId: this.actor(req).id,
      requestId: req.requestId ?? null,
      ipAddress: clientIp(req),
    };
  }

  private actor(req: Request): AuthenticatedUser {
    const actor = req.user;
    if (!actor) {
      throw new Error('Aktor tidak ditemukan — rute ini harus dijaga.');
    }
    return actor;
  }
}
