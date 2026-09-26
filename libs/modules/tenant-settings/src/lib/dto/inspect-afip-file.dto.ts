import { IsString, MaxLength, MinLength } from 'class-validator';

export class InspectAfipFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  text!: string;
}
