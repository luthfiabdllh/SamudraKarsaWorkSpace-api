import { Controller, Get, Query } from '@nestjs/common';

import { Policy } from '../policy/policy.decorator';
import { AuditService } from './audit.service';
import { ListAuditDto } from './dto/audit.dto';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Policy('audit:read')
  list(@Query() dto: ListAuditDto) {
    return this.auditService.list(dto);
  }
}
