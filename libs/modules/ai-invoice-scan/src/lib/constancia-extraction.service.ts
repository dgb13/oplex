import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.token.js';

const DEFAULT_MODEL = 'claude-sonnet-5';

/** Lo que la IA lee de una Constancia de Inscripción de ARCA (o de una
 * constancia de Ingresos Brutos). Todo es lectura de la IA, nunca un dato
 * validado - la UI lo compara contra el padrón y el usuario decide. */
export interface ConstanciaExtraction {
  isConstancia: boolean;
  cuit: string | null;
  name: string | null;
  ivaCondition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | null;
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
      fiscalAddress: { type: ['string', 'null'], description: 'Domicilio fiscal completo tal cual figura.' },
      activityStartDate: { type: ['string', 'null'], description: 'Fecha de inicio de actividades, formato AAAA-MM-DD. null si no figura el día completo.' },
      grossIncomeType: {
        type: ['string', 'null'],
        enum: ['SIMPLIFICADO', 'LOCAL', 'CONVENIO_MULTILATERAL', 'EXENTO', 'NO_INSCRIPTO', null],
        description: 'Situación en Ingresos Brutos si la constancia la informa (ej. Régimen Simplificado provincial incluido en el monotributo unificado).',
      },
      grossIncomeDetail: { type: ['string', 'null'], description: 'Texto corto para imprimir en la factura, ej. "Régimen Simplificado Mendoza" o el número de inscripción.' },
    },
    required: ['isConstancia', 'cuit', 'name', 'ivaCondition', 'fiscalAddress', 'activityStartDate', 'grossIncomeType', 'grossIncomeDetail'],
  },
};

const PROMPT = `Este documento debería ser una Constancia de Inscripción (o Constancia de Opción de Monotributo) de ARCA/AFIP de Argentina. Extraé sus datos con la herramienta ${TOOL.name}. Copiá los textos tal cual figuran; no inventes: si un dato no aparece, devolvé null. Si el documento no es una constancia, isConstancia=false y el resto null.`;

@Injectable()
export class ConstanciaExtractionService {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic) {}

  async extract(buffer: Buffer, mimetype: string): Promise<ConstanciaExtraction> {
    const response = await this.anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
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
    return { ...out, cuit: out.cuit ? out.cuit.replace(/\D/g, '') || null : null };
  }
}
