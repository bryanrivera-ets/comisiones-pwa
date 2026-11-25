interface Props {
  titulo: string;
  etapa: number;
  descripcion: string;
}

/** Marcador temporal para las pantallas que aún no se construyen. */
export function EnConstruccion({ titulo, etapa, descripcion }: Props) {
  return (
    <section>
      <h1>{titulo}</h1>
      <div className="tarjeta">
        <p>{descripcion}</p>
        <p className="texto-tenue">Se construye en la etapa {etapa}.</p>
      </div>
    </section>
  );
}
