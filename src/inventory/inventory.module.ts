import { Module } from '@nestjs/common';
import { NumberingModule } from '../numbering/numbering.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [NumberingModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
