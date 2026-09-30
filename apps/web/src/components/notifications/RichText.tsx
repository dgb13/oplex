/** Renderiza el markdown mínimo de los avisos: sólo **negrita**. El texto
 * viene del servidor pero incluye nombres de artículos/usuarios que cargó
 * gente - por eso nada de dangerouslySetInnerHTML, sólo partes de texto. */
export function RichText({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-semibold text-foreground">
            {part}
          </b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
