import { Module } from '@nestjs/common';
import { WorkCalendarService } from './work-calendar.service.js';

/** Where and when people work: locations' holiday calendars and weekly offs. */
@Module({ providers: [WorkCalendarService], exports: [WorkCalendarService] })
export class WorkCalendarModule {}
