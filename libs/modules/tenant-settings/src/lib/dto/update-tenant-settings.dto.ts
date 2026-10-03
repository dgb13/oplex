import { EmailSenderMode, ReminderTone, TenantTaxCondition } from '@plexo/database';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * arReminderIntervalDays is nullable on purpose (null = off, the original
 * one-time-alert behavior) - ValidateIf skips IsInt/Min entirely when the
 * value is null, but still enforces them when a number is sent. Omitting
 * the field entirely (undefined) is also allowed - a PATCH that doesn't
 * mention it shouldn't be forced to explicitly repeat the current value.
 *
 * emailCustomDomain/resendDomainId/domainStatus are deliberately NOT here -
 * they only ever get written atomically by registerCustomDomain/
 * refreshDomainStatus (see TenantSettingsService), never by this generic
 * PATCH, so a domain name can never end up saved without actually being
 * registered with Resend.
 */
export class UpdateTenantSettingsDto {
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  arReminderIntervalDays?: number | null;

  @IsOptional()
  @IsEnum(EmailSenderMode)
  emailSenderMode?: EmailSenderMode;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  emailFromName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._%+-]+$/, {
    message: 'emailFromLocalPart sólo admite letras, números y ._%+-',
  })
  @MaxLength(64)
  emailFromLocalPart?: string;

  @IsOptional()
  @IsEnum(ReminderTone)
  reminderTone?: ReminderTone;

  /** null clears it (no CC sent); omitting the field leaves the stored
   * value untouched, same convention as arReminderIntervalDays. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail()
  reminderCcEmail?: string | null;

  // El tenant declara ser agente de retención ante AFIP/ARBA/etc. para
  // cada impuesto - ver el comentario del modelo TenantSettings. Gatilla
  // qué WithholdingRegime puede usarse al registrar un pago a proveedor.
  @IsOptional()
  @IsBoolean()
  withholdingAgentIncomeTax?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdingAgentVat?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdingAgentGrossIncome?: boolean;

  /** null clears it (vuelve a "sin configurar", la UI cae a selección
   * manual de letra); omitir el campo deja el valor guardado sin tocar -
   * misma convención que reminderCcEmail. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(TenantTaxCondition)
  ownTaxCondition?: TenantTaxCondition | null;

  // Datos fiscales del emisor que van en el PDF de Facturación (ver
  // @plexo/invoicing/pdf) - mismo criterio de "null limpia, omitir deja sin
  // tocar" que ownTaxCondition/reminderCcEmail.
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(200)
  fiscalAddress?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(50)
  grossIncomeNumber?: string | null;

  // Situación en Ingresos Brutos (provincial, ARCA no la informa).
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(['SIMPLIFICADO', 'LOCAL', 'CONVENIO_MULTILATERAL', 'EXENTO', 'NO_INSCRIPTO'])
  grossIncomeType?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  activityStartDate?: string | null;

  /** null vuelve a "sin sugerencia" para los artículos que no tengan su
   * propio Article.markupPercent; omitir el campo deja el valor guardado
   * sin tocar - misma convención que reminderCcEmail/ownTaxCondition. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  defaultMarkupPercent?: number | null;

  // Datos de la empresa para los PDF (ver TenantSettings.tradeName en el
  // schema). null borra el valor, omitir el campo lo deja como está.
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  tradeName?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(60)
  contactPhone?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsEmail()
  contactEmail?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(200)
  website?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'El color tiene que ser un código como #4f39f6' })
  brandColor?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(80)
  bankName?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @Matches(/^\d{22}$/,{ message: 'El CBU/CVU tiene que tener 22 números' })
  bankCbu?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  bankAlias?: string | null;

  @IsOptional()
  @IsBoolean()
  quoteShowBankDetails?: boolean;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  quoteDefaultPaymentTerms?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  quoteDefaultDeliveryTerms?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  quoteDefaultDeliveryPlace?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(300)
  quoteDefaultWarranty?: string | null;
}
