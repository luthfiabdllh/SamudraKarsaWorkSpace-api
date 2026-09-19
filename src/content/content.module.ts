import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

/** Konten publikasi (Humas) — modul Fase 4. */
@Module({
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
