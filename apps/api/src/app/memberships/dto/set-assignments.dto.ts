import { IsArray, IsString } from 'class-validator';

export class SetAssignmentsDto {
  @IsArray()
  @IsString({ each: true })
  studioUserIds!: string[];
}
