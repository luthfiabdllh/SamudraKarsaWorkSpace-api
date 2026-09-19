import { Module } from '@nestjs/common';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/** Mitra / sponsorship — modul Fase 4. */
@Module({
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
