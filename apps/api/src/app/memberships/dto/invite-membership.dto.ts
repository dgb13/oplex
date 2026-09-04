import { IsString, MinLength } from 'class-validator';

/** Email o CUIT del tenant/estudio del otro lado - MembershipsService.
 * resolveIdentifier() decide cuál es por la forma (contiene "@" o no). */
export class InviteMembershipDto {
  @IsString()
  @MinLength(1)
  identifier!: string;
}
