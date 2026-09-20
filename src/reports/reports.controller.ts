import { Controller, Get, Param } from '@nestjs/common';

import { Policy } from '../policy/policy.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('export/:table')
  @Policy('member:admin')
  @RateLimit({ limit: 5, window: 3600 })
  exportTable(@Param('table') table: string) {
    return this.reportsService.exportTable(table);
  }
}
