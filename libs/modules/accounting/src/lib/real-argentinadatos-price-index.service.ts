import { Injectable, Logger } from '@nestjs/common';
import {
  PriceIndexLookupError,
  type PriceIndexMonthlyVariation,
  type PriceIndexSourcePort,
} from './price-index-source.port.js';

const INFLACION_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';

// La serie de esta fuente arranca en 1943 - encadenar variaciones mensuales
// compuestas desde ahí desborda cualquier precisión razonable de Decimal
// mucho antes de llegar a hoy (confirmado: overflow real de indexValue
// alrededor de 1988, en plena hiperinflación argentina, sin siquiera
// contar las re-denominaciones de moneda de por medio - peso ley, austral,
// peso convertible...). El Ajuste por Inflación (RT6/NC39) sólo necesita el
// ciclo vigente, reactivado por FACPCE Resolución 539/2018 para ejercicios
// cerrados desde julio de 2018 - se descarta todo período anterior a este
// corte, con margen.
const MIN_PERIOD = new Date(Date.UTC(2017, 0, 1));

interface ArgentinaDatosInflacionRow {
  fecha?: string;
  valor?: number;
}

/**
 * No hay un endpoint JSON propio de INDEC para el IPC mensual -
 * api.argentinadatos.com es un agregador público (sin key) que devuelve la
 * variación mensual histórica ({fecha, valor}, fecha = fin de mes). No se
 * identifica explícitamente como fuente oficial INDEC (confirmado
 * investigando antes de escribir esto) - por eso el sync automático nunca
 * pisa un período que el usuario ya haya corregido a mano (source=MANUAL,
 * ver PriceIndexService.syncFromSource). Si el fetch falla o el shape no
 * trae "valor" numérico, error claro, nunca inventar un valor - misma
 * disciplina que RealBnaExchangeRateService.
 */
@Injectable()
export class RealArgentinaDatosPriceIndexService implements PriceIndexSourcePort {
  private readonly logger = new Logger(RealArgentinaDatosPriceIndexService.name);

  async getMonthlyVariations(): Promise<PriceIndexMonthlyVariation[]> {
    let response: Response;
    try {
      response = await fetch(INFLACION_URL);
    } catch (err) {
      throw new PriceIndexLookupError('No se pudo conectar con el servicio de índices de inflación', err);
    }
    if (!response.ok) {
      throw new PriceIndexLookupError(`El servicio de índices de inflación respondió ${response.status}`);
    }

    const rows = (await response.json()) as ArgentinaDatosInflacionRow[];
    if (!Array.isArray(rows)) {
      throw new PriceIndexLookupError('La respuesta del servicio de índices de inflación no es una lista');
    }

    const variations: PriceIndexMonthlyVariation[] = [];
    for (const row of rows) {
      if (typeof row.fecha !== 'string' || typeof row.valor !== 'number') continue;
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(row.fecha);
      if (!match) continue;
      const [, year, month] = match;
      const period = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      if (period < MIN_PERIOD) continue;
      variations.push({ period, variationPct: row.valor });
    }

    if (variations.length === 0) {
      throw new PriceIndexLookupError('La respuesta del servicio de índices de inflación no trajo ningún período válido');
    }

    this.logger.log(`Índices de inflación sincronizados: ${variations.length} períodos recibidos`);
    return variations;
  }
}
