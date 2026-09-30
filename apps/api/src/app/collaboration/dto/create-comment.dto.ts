import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { COMMENTABLE_ENTITIES } from '../collaboration-links.js';

export class CreateCommentDto {
  @IsIn(COMMENTABLE_ENTITIES)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  // Las @menciones las resuelve el front al elegir de la lista (por id, no
  // por nombre: dos personas pueden llamarse igual). El servidor sólo
  // avisa a las que existan en esta empresa.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentionedUserIds?: string[];
}
