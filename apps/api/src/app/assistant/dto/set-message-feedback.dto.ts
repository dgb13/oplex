import { IsIn } from 'class-validator';

export class SetMessageFeedbackDto {
  @IsIn(['UP', 'DOWN'])
  feedback!: 'UP' | 'DOWN';
}
