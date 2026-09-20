import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingDecisionsController } from './meeting-decisions/meeting-decisions.controller';
import { MeetingDecisionsService } from './meeting-decisions/meeting-decisions.service';

@Module({
  controllers: [MeetingsController, MeetingDecisionsController],
  providers: [MeetingsService, MeetingDecisionsService],
})
export class MeetingsModule {}
