// Réplica de la "Constancia de Opción" de monotributo de ARCA (el
// "Formulario de Impresión de Constancia de Monotributo") con datos
// inventados, para que la persona la reconozca cuando la saque. Siempre
// clara: es una hoja de papel. Los numeritos señalan lo que toma Oplex.

function Pin({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span
      className={`absolute top-1/2 z-[1] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-amber-400 font-sans text-[11px] font-extrabold text-amber-950 ${className || '-right-3'}`}
    >
      {n}
    </span>
  );
}

const HL = 'rounded-[2px] bg-amber-400/20 outline outline-2 outline-offset-1 outline-amber-400';

export function ConstanciaExample() {
  return (
    <figure className="m-0 overflow-hidden rounded-[10px] border bg-muted">
      <div className="bg-border px-2.5 py-1.5 text-[11px] text-muted-foreground">Constancia de ejemplo · datos ficticios</div>
      <div
        aria-label="Constancia de ejemplo con datos ficticios"
        className="m-3 bg-white px-2.5 pt-2.5 pb-2 text-[9px] leading-[1.3] text-[#111] shadow-[0_2px_10px_rgba(0,0,0,.12)] [font-family:Arial,Helvetica,sans-serif]"
      >
        <div className="mb-1.5 flex justify-between text-[7.5px] text-[#333]">
          <span>dd/mm/aa, hh:mm</span>
          <span>Formulario de Impresión de Constancia de Monotributo</span>
        </div>
        <div className="relative border-[1.5px] border-[#111] px-3 pt-3 pb-2">
          <div className="mb-1.5 text-[22px] font-black tracking-[.02em]">ARCA</div>
          <p className="m-0 text-center text-[17px] font-bold">CONSTANCIA DE OPCIÓN</p>
          <p className="mt-0.5 mb-3.5 text-center text-[9.5px] font-bold">Régimen Simplificado para Pequeños Contribuyentes</p>
          <div className={`relative border-[1.2px] border-[#111] px-1.5 py-1 leading-[1.35] ${HL}`}>
            <b>CUIT:</b> 20-12345678-9
            <br />
            PÉREZ JUAN CARLOS
            <br />
            AV. SAN MARTÍN 1234
            <br />
            GODOY CRUZ
            <br />
            5501-MENDOZA
            <Pin n={1} />
          </div>
          <div className="mt-2 mb-1">020 - MONOTRIBUTO</div>
          <div className="relative my-1 flex flex-col items-center">
            <div className={`w-12 border border-[#111] pt-px text-center text-[7px] ${HL}`}>
              CATEGORÍA
              <b className="block text-[26px] leading-[1.05] font-normal">D</b>
            </div>
            <div className="mt-0.5 text-[8.5px]">LOCACIONES DE SERVICIOS</div>
            <Pin n={2} className="right-[28%]" />
          </div>
          <div className={`relative mt-1.5 w-max text-[7.5px] ${HL}`}>
            FECHA DE INICIO: 01-03-2016
            <Pin n={4} className="-right-7" />
          </div>
          <hr className="mt-1 mb-2 border-0 border-t-[1.5px] border-[#9a9a9a]" />
          <div className={`relative text-[8.5px] ${HL}`}>
            5445 - REGIMEN SIMPLIFICADO IMPUESTO SOBRE INGRESOS BRUTOS MENDOZA
            <Pin n={3} />
          </div>
          <div className="mt-px text-center text-sm font-bold">AC</div>
          <div className="text-center text-[8px] font-bold">(PRESENTACIÓN ESPONTÁNEA)</div>
          <div className="mt-1.5 text-[7.5px]">FECHA DE INICIO: 01-03-2016</div>
          <hr className="mt-1 mb-2 border-0 border-t-[1.5px] border-[#9a9a9a]" />
          <div className="mt-1.5 mb-2.5 text-[8.5px] leading-normal">ACTIVIDAD: F883 - 620100 - SERVICIOS DE CONSULTORES EN INFORMÁTICA</div>
          <div className="flex justify-between gap-2 text-[7.5px]">
            <span>
              Vigencia de la presente constancia: <b>dd-mm-aaaa a dd-mm-aaaa</b>
            </span>
            <span>
              Hora <b>hh:mm:ss</b> Verificador <b>000000000000</b>
            </span>
          </div>
        </div>
        <div className="mt-[3px] text-[6.5px] text-[#333]">
          Los datos contenidos en la presente constancia deberán ser validados por el receptor de la misma en la página institucional de ARCA.
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-3 pb-2.5 text-xs text-muted-foreground">
        {['Razón social y domicilio fiscal', 'Monotributo y categoría', 'Ingresos Brutos', 'Inicio de actividades'].map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1">
            <i className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-extrabold not-italic text-amber-950">
              {i + 1}
            </i>
            {label}
          </span>
        ))}
      </div>
      <figcaption className="border-t px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
        Así se ve la constancia de un monotributista (datos inventados). Para Responsable Inscripto se llama &quot;Constancia de
        Inscripción&quot; y cambia el detalle de impuestos.
      </figcaption>
    </figure>
  );
}
