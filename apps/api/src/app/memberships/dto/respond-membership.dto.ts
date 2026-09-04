import { IsIn } from 'class-validator';

export class RespondMembershipDto {
  @IsIn(['ACCEPTED', 'DECLINED'])
  decision!: 'ACCEPTED' | 'DECLINED';
}
