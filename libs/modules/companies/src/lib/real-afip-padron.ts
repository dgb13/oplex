import { Injectable } from '@nestjs/common';
import {
  ArcaPadronNotConfiguredError,
  ArcaPadronNotFoundError,
  ArcaPadronService,
} from '@plexo/afip-credentials';
import {
  AfipLookupError,
  AfipNotConfiguredError,
  type AfipPadronData,
  type AfipPadronPort,
} from './afip-padron.port.js';

/**
 * Padrón de ARCA (constancia de inscripción, A5) con el certificado de
 * OPLEX - ver ArcaPadronService. Antes usaba el certificado de cada tenant
 * contra ws_sr_padron_a13, lo que dejaba sin autocompletado a todo tenant
 * que todavía no conectó ARCA (justo cuando más lo necesita).
 */
@Injectable()
export class RealAfipPadronService implements AfipPadronPort {
  constructor(private readonly arcaPadron: ArcaPadronService) {}

  async lookup(cuit: string): Promise<AfipPadronData | null> {
    try {
      const person = await this.arcaPadron.lookup(cuit);
      return {
        cuit: person.cuit,
        personType: person.personType,
        name: person.name,
        taxCondition: person.taxConditionLabel,
        ivaCondition: person.ivaCondition,
        fiscalAddress: person.fiscalAddress,
        mainActivity: person.mainActivity,
        activityStartMonth: person.activityStartMonth,
      };
    } catch (err) {
      if (err instanceof ArcaPadronNotConfiguredError) throw new AfipNotConfiguredError();
      if (err instanceof ArcaPadronNotFoundError) return null;
      throw new AfipLookupError((err as Error).message, err);
    }
  }
}
