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
  AddBenefitDto,
  AddFollowupDto,
  CreatePartnerDto,
  ListPartnersQueryDto,
  TransitionPartnerDto,
  UpdateBenefitDto,
  UpdatePartnerDto,
} from './dto/partners.dto';
import { PartnersService, type WriteContext } from './partners.service';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @Policy('partner:read')
  list(@Query() query: ListPartnersQueryDto) {
    return this.partners.list(query);
  }

  @Get(':id')
  @Policy('partner:read')
  detail(@Param('id') id: string, @Req() req: Request) {
    return this.partners.detail(id, this.actor(req));
  }

  @Post()
  @Policy('partner:write')
  create(@Body() dto: CreatePartnerDto, @Req() req: Request) {
    return this.partners.create(dto, this.context(req));
  }

  @Patch(':id')
  @Policy('partner:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.partners.update(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('partner:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionPartnerDto,
    @Req() req: Request,
  ) {
    return this.partners.transition(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('partner:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.partners.remove(id, this.context(req));
  }

  @Post(':id/followups')
  @Policy('partner:write')
  addFollowup(
    @Param('id') id: string,
    @Body() dto: AddFollowupDto,
    @Req() req: Request,
  ) {
    return this.partners.addFollowup(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/benefits')
  @Policy('partner:write')
  addBenefit(
    @Param('id') id: string,
    @Body() dto: AddBenefitDto,
    @Req() req: Request,
  ) {
    return this.partners.addBenefit(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Patch(':id/benefits/:benefitId')
  @Policy('partner:write')
  updateBenefit(
    @Param('id') id: string,
    @Param('benefitId') benefitId: string,
    @Body() dto: UpdateBenefitDto,
  ) {
    return this.partners.updateBenefit(id, benefitId, dto);
  }

  @Delete(':id/benefits/:benefitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('partner:delete')
  removeBenefit(
    @Param('id') id: string,
    @Param('benefitId') benefitId: string,
    @Req() req: Request,
  ) {
    return this.partners.removeBenefit(
      id,
      benefitId,
      this.actor(req),
      this.context(req),
    );
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
    if (!actor) throw new Error('Aktor tidak ditemukan.');
    return actor;
  }
}
