// Cálculos del zoom, separados de la pantalla para reutilizarlos después en el proyector.
// El zoom se describe con la escala y el punto de la diapositiva que queda al centro:
// cx y cy van de 0 a 1, donde 0.5 es el centro de la diapositiva.

export const ESCALA_MAXIMA = 5;
export const ZOOM_INICIAL = Object.freeze({ escala: 1, cx: 0.5, cy: 0.5 });

// Tamaño de la diapositiva sin zoom, ajustada al contenedor sin deformarse.
function tamanoAjustado(contenedor, proporcion) {
  const ancho = Math.min(contenedor.ancho, contenedor.alto * proporcion);
  return { ancho, alto: ancho / proporcion };
}

function limitarEje(centro, visible) {
  if (visible >= 1) return 0.5;
  return Math.min(1 - visible / 2, Math.max(visible / 2, centro));
}

// Evita alejarse de más o dejar la diapositiva fuera de la vista.
export function limitar(zoom, contenedor, proporcion) {
  const escala = Math.min(ESCALA_MAXIMA, Math.max(1, zoom.escala));
  const base = tamanoAjustado(contenedor, proporcion);
  return {
    escala,
    cx: limitarEje(zoom.cx, contenedor.ancho / (base.ancho * escala)),
    cy: limitarEje(zoom.cy, contenedor.alto / (base.alto * escala)),
  };
}

// Posición y tamaño que debe tener la imagen dentro del contenedor.
export function calcularCaja(zoom, contenedor, proporcion) {
  const base = tamanoAjustado(contenedor, proporcion);
  const ancho = base.ancho * zoom.escala;
  const alto = base.alto * zoom.escala;
  return {
    izquierda: contenedor.ancho / 2 - zoom.cx * ancho,
    arriba: contenedor.alto / 2 - zoom.cy * alto,
    ancho,
    alto,
  };
}

// Cambia la escala manteniendo fijo el punto de la diapositiva que está bajo el cursor.
export function acercarEnPunto(zoom, factor, x, y, contenedor, proporcion) {
  const antes = calcularCaja(zoom, contenedor, proporcion);
  const u = (x - antes.izquierda) / antes.ancho;
  const v = (y - antes.arriba) / antes.alto;
  const escala = Math.min(ESCALA_MAXIMA, Math.max(1, zoom.escala * factor));
  const base = tamanoAjustado(contenedor, proporcion);
  return limitar(
    {
      escala,
      cx: u - (x - contenedor.ancho / 2) / (base.ancho * escala),
      cy: v - (y - contenedor.alto / 2) / (base.alto * escala),
    },
    contenedor,
    proporcion
  );
}

// Mueve la vista al arrastrar con el mouse.
export function desplazar(zoom, dx, dy, contenedor, proporcion) {
  const caja = calcularCaja(zoom, contenedor, proporcion);
  return limitar(
    { escala: zoom.escala, cx: zoom.cx - dx / caja.ancho, cy: zoom.cy - dy / caja.alto },
    contenedor,
    proporcion
  );
}
