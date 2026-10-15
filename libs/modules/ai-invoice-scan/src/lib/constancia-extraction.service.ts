import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { DOCUMENTS_DEFAULT_MODEL } from './ai-invoice-extraction.service.js';
import { ANTHROPIC_CLIENT } from './anthropic-client.token.js';

/** Lo que la IA lee de una Constancia de Inscripción de ARCA (o de una
 * constancia de Ingresos Brutos). Todo es lectura de la IA, nunca un dato
 * validado - la UI lo compara contra el padrón y el usuario decide. */
export interface ConstanciaExtraction {
  isConstancia: boolean;
  cuit: string | null;
  name: string | null;
  ivaCondition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | null;
  /** Letra de la categoría de Monotributo (A..K). */
  monotributoCategory: string | null;
  fiscalAddress: string | null;
  /** AAAA-MM-DD */
  activityStartDate: string | null;
  grossIncomeType: 'SIMPLIFICADO' | 'LOCAL' | 'CONVENIO_MULTILATERAL' | 'EXENTO' | 'NO_INSCRIPTO' | null;
  grossIncomeDetail: string | null;
}

const TOOL = {
  name: 'constancia_inscripcion_data',
  description: 'Datos leídos de una constancia de inscripción de ARCA (ex AFIP) de Argentina.',
  input_schema: {
    type: 'object' as const,
    properties: {
      isConstancia: { type: 'boolean', description: 'false si el documento NO es una constancia de inscripción / de opción de monotributo.' },
      cuit: { type: ['string', 'null'], description: 'Sólo los 11 dígitos.' },
      name: { type: ['string', 'null'], description: 'Apellido y nombre o razón social, tal cual figura.' },
      ivaCondition: { type: ['string', 'null'], enum: ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', null] },
      monotributoCategory: { type: ['string', 'null'], description: 'Sólo para monotributo: la letra del recuadro CATEGORÍA (A a K). null en otro caso.' },
      fiscalAddress: { type: ['string', 'null'], description: 'Domicilio fiscal completo tal cual figura.' },
      activityStartDate: {
        type: ['string', 'null'],
        description:
          'Inicio de actividades, formato AAAA-MM-DD. En la Constancia de Opción de monotributo es la "FECHA DE INICIO" que está debajo de la categoría del monotributo (020 - MONOTRIBUTO), NO la de Ingresos Brutos ni la de otros impuestos. En la Constancia de Inscripción (régimen general) es la fecha de inicio de actividades o, si no figura, la del impuesto a las ganancias o IVA. null si no figura el día completo.',
      },
      grossIncomeType: {
        type: ['string', 'null'],
        enum: ['SIMPLIFICADO', 'LOCAL', 'CONVENIO_MULTILATERAL', 'EXENTO', 'NO_INSCRIPTO', null],
        description:
          'Situación en Ingresos Brutos si la constancia la informa. SIMPLIFICADO cuando figura un "REGIMEN SIMPLIFICADO IMPUESTO SOBRE INGRESOS BRUTOS" con estado AC (activo). Si ese impuesto figura NA (jurisdicción no adherida) o no figura, null.',
      },
      grossIncomeDetail: {
        type: ['string', 'null'],
        description:
          'Texto corto (máximo 50 caracteres) para imprimir en la factura: el número de inscripción en Ingresos Brutos o, si no figura, el régimen y la provincia (ej. "Régimen Simplificado Mendoza"). No copies el código del impuesto (ej. "5445 - ...") ni su descripción completa.',
      },
    },
    required: ['isConstancia', 'cuit', 'name', 'ivaCondition', 'monotributoCategory', 'fiscalAddress', 'activityStartDate', 'grossIncomeType', 'grossIncomeDetail'],
  },
};

const PROMPT = `Este documento debería ser una Constancia de Inscripción (o Constancia de Opción de Monotributo) de ARCA/AFIP de Argentina. Extraé sus datos con la herramienta ${TOOL.name}. Copiá los textos tal cual figuran; no inventes: si un dato no aparece, devolvé null. Si el documento no es una constancia, isConstancia=false y el resto null.`;

@Injectable()
export class ConstanciaExtractionService {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic) {}

  async extract(buffer: Buffer, mimetype: string): Promise<ConstanciaExtraction> {
    const response = await this.anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || DOCUMENTS_DEFAULT_MODEL,
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mimetype === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') },
            } as never,
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new InternalServerErrorException('Claude no devolvió una lectura estructurada');
    }
    const out = toolUse.input as ConstanciaExtraction;
    return {
      ...out,
      cuit: out.cuit ? out.cuit.replace(/\D/g, '') || null : null,
      grossIncomeDetail: shortenGrossIncomeDetail(out.grossIncomeDetail),
    };
  }
}

// Tope del campo "Ingresos Brutos" (UpdateTenantSettingsDto.grossIncomeNumber).
const GROSS_INCOME_MAX = 50;

/** El renglón del impuesto en la constancia viene como
 * "5445 - Régimen Simplificado Impuesto sobre Ingresos Brutos Mendoza": el
 * 5445 es el código del impuesto en ARCA, no un número de inscripción, y el
 * texto entero no entra en el campo. Queda "Régimen Simplificado Mendoza".
 * Exportado para tests. */
export function shortenGrossIncomeDetail(detail: string | null): string | null {
  if (!detail) return null;
  let text = detail
    .replace(/^\s*\d{3,5}\s*-\s*/, '')
    .replace(/\s*(del\s+)?impuesto\s+sobre\s+(los\s+)?ingresos\s+brutos\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > GROSS_INCOME_MAX) {
    const cut = text.slice(0, GROSS_INCOME_MAX);
    text = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  }
  return text || null;
}
