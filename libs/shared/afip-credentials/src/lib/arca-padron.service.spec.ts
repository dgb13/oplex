import { mapConstancia } from './arca-padron.service.js';

describe('mapConstancia', () => {
  it('maps a monotributista (persona humana)', () => {
    const person = mapConstancia('20270403949', {
      datosGenerales: {
        tipoPersona: 'FISICA',
        apellido: 'BELVEDERE',
        nombre: 'DARIO GERMAN',
        domicilioFiscal: {
          direccion: 'PADRE GAGLIARDI 3572 2',
          localidad: 'VILLANUEVA',
          codPostal: '5521',
          descripcionProvincia: 'MENDOZA',
        },
      },
      datosMonotributo: {
        categoriaMonotributo: { descripcionCategoria: 'D LOCACIONES DE SERVICIO' },
        impuesto: { idImpuesto: 20, estadoImpuesto: 'AC', periodo: 201508 },
        actividadMonotributista: { idActividad: 620200, descripcionActividad: 'SERVICIOS DE CONSULTORES EN INFORMÁTICA', periodo: 201508 },
      },
    });
    expect(person).toEqual({
      cuit: '20270403949',
      personType: 'FISICA',
      name: 'BELVEDERE DARIO GERMAN',
      ivaCondition: 'MONOTRIBUTO',
      taxConditionLabel: 'Monotributo (D LOCACIONES DE SERVICIO)',
      fiscalAddress: 'PADRE GAGLIARDI 3572 2, VILLANUEVA (5521), MENDOZA',
      mainActivity: 'SERVICIOS DE CONSULTORES EN INFORMÁTICA (620200)',
      activityStartMonth: '2015-08',
    });
  });

  it('maps a Responsable Inscripto (jurídica) from impuesto 30 and the orden-1 actividad', () => {
    const person = mapConstancia('30500010912', {
      datosGenerales: { tipoPersona: 'JURIDICA', razonSocial: 'EMPRESA SA' },
      datosRegimenGeneral: {
        impuesto: [
          { idImpuesto: 10, estadoImpuesto: 'AC', periodo: 199807 },
          { idImpuesto: 30, estadoImpuesto: 'AC', periodo: 199001 },
        ],
        actividad: [
          { idActividad: 1, descripcionActividad: 'SECUNDARIA', orden: 2, periodo: 201001 },
          { idActividad: 2, descripcionActividad: 'PRINCIPAL', orden: 1, periodo: 199501 },
        ],
      },
    });
    expect(person.ivaCondition).toBe('RESPONSABLE_INSCRIPTO');
    expect(person.taxConditionLabel).toBe('Responsable Inscripto');
    expect(person.name).toBe('EMPRESA SA');
    expect(person.mainActivity).toBe('PRINCIPAL (2)');
    expect(person.activityStartMonth).toBe('1990-01');
    expect(person.fiscalAddress).toBeNull();
  });

  it('leaves the IVA condition null when it cannot be deduced', () => {
    const person = mapConstancia('20111111112', { datosGenerales: { tipoPersona: 'FISICA', apellido: 'X' } });
    expect(person.ivaCondition).toBeNull();
    expect(person.activityStartMonth).toBeNull();
  });
});
