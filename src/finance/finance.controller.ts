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
  CreateBudgetDto,
  CreateBudgetItemDto,
  CreateTransactionDto,
  ListBudgetsQueryDto,
  ListTransactionsQueryDto,
  TransitionBudgetDto,
  UpdateBudgetDto,
  UpdateBudgetItemDto,
  UpdateTransactionDto,
} from './dto/finance.dto';
import { FinanceService, type WriteContext } from './finance.service';

/**
 * Keuangan — anggaran dan transaksi.
 *
 * | Rute | Penjagaan |
 * |---|---|
 * | Semua | `finance:read` (atau `finance:write` untuk tulis) |
 *
 * Guard memeriksa **peran** (owner/co_owner). Kepala Sekbend diizinkan oleh
 * `assertFinanceAccess()` di service, bukan di sini — karena guard tidak
 * mempunyai akses ke `divisionCodes` aktor.
 *
 * **404, bukan 403** untuk semua yang tidak berwenang.
 */
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // ─── Anggaran ──────────────────────────────────────────────────────────────

  @Get('budgets')
  @Policy('finance:read')
  listBudgets(@Query() query: ListBudgetsQueryDto, @Req() req: Request) {
    return this.finance.listBudgets(query, this.actor(req));
  }

  @Get('budgets/:id')
  @Policy('finance:read')
  getBudget(@Param('id') id: string, @Req() req: Request) {
    return this.finance.getBudget(id, this.actor(req));
  }

  @Post('budgets')
  @Policy('finance:write')
  createBudget(@Body() dto: CreateBudgetDto, @Req() req: Request) {
    return this.finance.createBudget(dto, this.actor(req), this.context(req));
  }

  @Patch('budgets/:id')
  @Policy('finance:write')
  updateBudget(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.finance.updateBudget(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Post('budgets/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('finance:write')
  transitionBudget(
    @Param('id') id: string,
    @Body() dto: TransitionBudgetDto,
    @Req() req: Request,
  ) {
    return this.finance.transitionBudget(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete('budgets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('finance:write')
  removeBudget(@Param('id') id: string, @Req() req: Request) {
    return this.finance.removeBudget(id, this.actor(req), this.context(req));
  }

  // ─── Rincian anggaran ──────────────────────────────────────────────────────

  @Post('budgets/:id/items')
  @Policy('finance:write')
  addBudgetItem(
    @Param('id') id: string,
    @Body() dto: CreateBudgetItemDto,
    @Req() req: Request,
  ) {
    return this.finance.addBudgetItem(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Patch('budgets/:id/items/:itemId')
  @Policy('finance:write')
  updateBudgetItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateBudgetItemDto,
    @Req() req: Request,
  ) {
    return this.finance.updateBudgetItem(
      id,
      itemId,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete('budgets/:id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('finance:write')
  removeBudgetItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
  ) {
    return this.finance.removeBudgetItem(
      id,
      itemId,
      this.actor(req),
      this.context(req),
    );
  }

  // ─── Transaksi ─────────────────────────────────────────────────────────────

  @Get('transactions')
  @Policy('finance:read')
  listTransactions(
    @Query() query: ListTransactionsQueryDto,
    @Req() req: Request,
  ) {
    return this.finance.listTransactions(query, this.actor(req));
  }

  @Get('transactions/export')
  @Policy('finance:read')
  exportTransactions(@Req() req: Request) {
    return this.finance.exportTransactions(this.actor(req));
  }

  @Get('transactions/:id')
  @Policy('finance:read')
  getTransaction(@Param('id') id: string, @Req() req: Request) {
    return this.finance.getTransaction(id, this.actor(req));
  }

  @Post('transactions')
  @Policy('finance:write')
  createTransaction(@Body() dto: CreateTransactionDto, @Req() req: Request) {
    return this.finance.createTransaction(
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Patch('transactions/:id')
  @Policy('finance:write')
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.finance.updateTransaction(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Patch('transactions/:id/verify')
  @HttpCode(HttpStatus.OK)
  @Policy('finance:write')
  verifyTransaction(@Param('id') id: string, @Req() req: Request) {
    return this.finance.verifyTransaction(
      id,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('finance:write')
  removeTransaction(@Param('id') id: string, @Req() req: Request) {
    return this.finance.removeTransaction(
      id,
      this.actor(req),
      this.context(req),
    );
  }

  // ─── Pembantu ──────────────────────────────────────────────────────────────

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
