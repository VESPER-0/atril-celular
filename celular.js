// Prompter y control en el celular. Toda decisión la toma la laptop; aquí solo se muestra y se piden cambios.
import { ZOOM_INICIAL, acercarEnPunto, calcularCaja, desplazar, limitar } from './zoom.js';

const TAMANO_INICIAL = 34;
const TAMANO_MINIMO = 18;
const TAMANO_MAXIMO = 90;
const PASO_TAMANO = 4;
const CLAVE_TAMANO = 'atril:tamanoCelular';
const CLAVE_CONTRASTE = 'atril:contrasteCelular';
const CLAVE_DIRECCION = 'atril:direccionLaptop';
const CONTRASTES = ['negro', 'blanco', 'azul'];
const SIN_LATIDO_MS = 8000;
const REINTENTO_MS = 1500;
const ENVIO_ZOOM_MS = 40;
const MARGEN_ZOOM = 12;
const FACTOR_BOTON_ZOOM = 1.25;
const ESCALA_DOBLE_TOQUE = 2.5;
const DOBLE_TOQUE_MS = 300;
const DOBLE_TOQUE_DISTANCIA = 30;
const ESCANEO_MS = 300;
const IMAGENES_A_LA_VEZ = 3;
const IMAGENES_GRANDES_GUARDADAS = 3;
const ES_PRIVADA = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// La misma página se abre de dos formas: servida por la laptop, o como app instalada desde internet.
// La instalada no sabe dónde está la laptop hasta escanear el código.
const ES_APP = location.protocol === 'https:';

const el = {
  inicio: document.querySelector('#inicio'),
  empezar: document.querySelector('#empezar'),
  inicioTexto: document.querySelector('#inicio-texto'),
  instalar: document.querySelector('#instalar'),
  ayudaInstalar: document.querySelector('#ayuda-instalar'),
  escanear: document.querySelector('#escanear'),
  camara: document.querySelector('#camara'),
  video: document.querySelector('#video'),
  cancelarCamara: document.querySelector('#cancelar-camara'),
  manualOpcion: document.querySelector('#manual-opcion'),
  manual: document.querySelector('#manual'),
  direccion: document.querySelector('#direccion'),
  mensaje: document.querySelector('#mensaje'),
  escanearOtraVez: document.querySelector('#escanear-otra-vez'),
  espera: document.querySelector('#espera'),
  presentacion: document.querySelector('#presentacion'),
  posicion: document.querySelector('#posicion'),
  cronometro: document.querySelector('#cronometro'),
  panel: document.querySelector('#panel'),
  expositor: document.querySelector('#expositor'),
  texto: document.querySelector('#texto'),
  miniatura: document.querySelector('#miniatura'),
  avisoNegro: document.querySelector('#aviso-negro'),
  sigue: document.querySelector('#sigue'),
  letraMenos: document.querySelector('#letra-menos'),
  letraMas: document.querySelector('#letra-mas'),
  contraste: document.querySelector('#contraste'),
  negro: document.querySelector('#negro'),
  anterior: document.querySelector('#anterior'),
  siguiente: document.querySelector('#siguiente'),
  sinConexion: document.querySelector('#sin-conexion'),
  abrirZoom: document.querySelector('#abrir-zoom'),
  vistaZoom: document.querySelector('#vista-zoom'),
  zoomNivel: document.querySelector('#zoom-nivel'),
  zoomZona: document.querySelector('#zoom-zona'),
  zoomArea: document.querySelector('#zoom-area'),
  zoomImagen: document.querySelector('#zoom-imagen'),
  zoomMenos: document.querySelector('#zoom-menos'),
  zoomMas: document.querySelector('#zoom-mas'),
  zoomReiniciar: document.querySelector('#zoom-reiniciar'),
  zoomCerrar: document.querySelector('#zoom-cerrar'),
  abrirLista: document.querySelector('#abrir-lista'),
  vistaLista: document.querySelector('#vista-lista'),
  lista: document.querySelector('#lista'),
  listaCerrar: document.querySelector('#lista-cerrar'),
};

let conexion = null;
let conectado = false;
let ultimoLatido = 0;
let empezado = false;
let proyecto = null;
let estado = null;
let pintada = null;
let estadoRecibidoEn = 0;
let presentacionRecibida = null;
// Pantalla encima del prompter: null, 'zoom' o 'lista'.
let vistaAbierta = null;
let zoomLocal = ZOOM_INICIAL;
let proporcion = 16 / 9;
let envioZoomPendiente = null;
const dedos = new Map();
let gesto = null;
let toqueEnCurso = null;
let ultimoToque = null;

/* ---------- Ajustes de este celular ---------- */

function leerAjuste(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarAjuste(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento, el ajuste solo dura mientras la página siga abierta.
  }
}

const tamanoGuardado = Number(leerAjuste(CLAVE_TAMANO));
let tamano = tamanoGuardado >= TAMANO_MINIMO && tamanoGuardado <= TAMANO_MAXIMO ? tamanoGuardado : TAMANO_INICIAL;
const contrasteGuardado = leerAjuste(CLAVE_CONTRASTE);
let direccionMensajes = ES_APP ? leerAjuste(CLAVE_DIRECCION) : `ws://${location.host}${location.pathname}ws`;
let contraste = CONTRASTES.includes(contrasteGuardado) ? contrasteGuardado : CONTRASTES[0];

function aplicarAjustes() {
  el.panel.style.setProperty('--tamano-prompter', `${tamano}px`);
  el.panel.dataset.contraste = contraste;
}

/* ---------- Pantalla encendida ---------- */

// Sin esto, el celular se apagaría solo a media exposición.
const pantallaEncendida = new window.NoSleep();

function mantenerEncendida() {
  pantallaEncendida.enable().catch(() => {});
}

// También oculta la barra que Chrome pone arriba porque la conexión local no va cifrada.
function pedirPantallaCompleta() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}

/* ---------- Imágenes ---------- */

const imagenes = new Map();
const pedidos = new Map();
const colaImagenes = [];
const grandesGuardadas = [];
let siguienteId = 1;
let imagenesEnCamino = 0;
let refrescarImagenes = false;

function atenderCola() {
  while (imagenesEnCamino < IMAGENES_A_LA_VEZ && colaImagenes.length && conectado) {
    const { id, datos } = colaImagenes.shift();
    imagenesEnCamino += 1;
    conexion.send(JSON.stringify({ tipo: 'pedir-imagen', id, ...datos }));
  }
}

function terminarPedido(id) {
  const pedido = pedidos.get(id);
  pedidos.delete(id);
  if (pedido) imagenesEnCamino -= 1;
  atenderCola();
  return pedido;
}

function olvidarImagen(clave) {
  imagenes.get(clave)?.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  imagenes.delete(clave);
}

// Una imagen ya recibida no se vuelve a pedir. Las de alta calidad pesan mucho: solo se guardan unas pocas.
function pedirImagen(indice, grande = false) {
  const clave = `${indice}/${grande ? 'grande' : 'chica'}`;
  if (imagenes.has(clave)) return imagenes.get(clave);

  const promesa = new Promise((resolver, rechazar) => {
    const id = siguienteId;
    siguienteId += 1;
    pedidos.set(id, { resolver, rechazar });
    const datos = { proyectoId: proyecto.proyectoId, indice, grande };
    // Lo que se está viendo se pide antes que el resto de la lista.
    if (grande) colaImagenes.unshift({ id, datos });
    else colaImagenes.push({ id, datos });
    atenderCola();
  });
  imagenes.set(clave, promesa);
  promesa.catch(() => imagenes.delete(clave));
  if (grande) {
    grandesGuardadas.push(clave);
    if (grandesGuardadas.length > IMAGENES_GRANDES_GUARDADAS) olvidarImagen(grandesGuardadas.shift());
  }
  return promesa;
}

function recibirImagen(datos) {
  const pedido = terminarPedido(new DataView(datos).getUint32(0));
  pedido?.resolver(URL.createObjectURL(new Blob([datos.slice(4)])));
}

// Si la conexión se corta, lo que venía en camino se vuelve a pedir al regresar.
function cancelarPedidos() {
  colaImagenes.length = 0;
  imagenesEnCamino = 0;
  for (const { rechazar } of pedidos.values()) rechazar(new Error('Sin conexión'));
  pedidos.clear();
}

function olvidarImagenes() {
  cancelarPedidos();
  for (const clave of [...imagenes.keys()]) olvidarImagen(clave);
  grandesGuardadas.length = 0;
}

function pintarMiniatura() {
  const indice = estado.indice;
  pedirImagen(indice)
    .then((url) => {
      if (estado?.indice === indice) el.miniatura.src = url;
    })
    .catch(() => {});
}

function cargarListaDeImagenes() {
  [...el.lista.children].forEach((boton, indice) => {
    const imagen = boton.querySelector('img');
    if (imagen.src) return;
    pedirImagen(indice)
      .then((url) => {
        imagen.src = url;
      })
      .catch(() => {});
  });
}

/* ---------- Pintar ---------- */

const expositorDe = (id) => proyecto.expositores.find((e) => e.id === id) ?? null;

function textoTiempo(milisegundos) {
  const total = Math.floor(milisegundos / 1000);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n) => String(n).padStart(2, '0');
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${dos(minutos)}:${dos(segundos)}`;
}

function pintarCronometro() {
  if (!estado) return;
  const extra = estado.corriendo ? Date.now() - estadoRecibidoEn : 0;
  el.cronometro.textContent = textoTiempo(estado.transcurridoMs + extra);
  el.cronometro.classList.toggle('en-pausa', !estado.corriendo);
}

function pintarSiguiente(indice, actual) {
  const siguiente = proyecto.diapositivas[indice + 1];
  el.sigue.classList.remove('cambia');
  el.sigue.style.removeProperty('--color-expositor');
  if (!siguiente) {
    el.sigue.textContent = 'Última diapositiva';
    return;
  }
  const expositor = expositorDe(siguiente.expositorId);
  if (expositor && expositor.id !== actual?.id) {
    el.sigue.classList.add('cambia');
    el.sigue.style.setProperty('--color-expositor', expositor.color);
    el.sigue.textContent = `Sigue: ${expositor.nombre}`;
  } else {
    el.sigue.textContent = expositor ? `Sigue: ${expositor.nombre} (continúa)` : 'Siguiente diapositiva';
  }
}

function pintarDiapositiva(indice) {
  const diapositiva = proyecto.diapositivas[indice];
  const expositor = expositorDe(diapositiva.expositorId);

  el.expositor.textContent = expositor?.nombre ?? '';
  el.expositor.hidden = !expositor;
  el.panel.classList.toggle('con-expositor', Boolean(expositor));
  if (expositor) el.panel.style.setProperty('--color-expositor', expositor.color);
  else el.panel.style.removeProperty('--color-expositor');

  const conTexto = Boolean(diapositiva.notas.trim());
  el.texto.textContent = conTexto ? diapositiva.notas : 'Esta diapositiva no tiene texto.';
  el.texto.classList.toggle('sin-texto', !conTexto);
  el.texto.scrollTop = 0;

  pintarMiniatura();
  pintarSiguiente(indice, expositor);
  if (vistaAbierta === 'zoom') cargarImagenZoom();
}

/* ---------- Zoom ---------- */

const medidaArea = () => ({ ancho: el.zoomArea.clientWidth, alto: el.zoomArea.clientHeight });

// Da al recuadro la forma de la diapositiva.
function ajustarAreaZoom() {
  // Deja lugar para el borde que separa la diapositiva del fondo.
  const ancho = el.zoomZona.clientWidth - MARGEN_ZOOM;
  const alto = el.zoomZona.clientHeight - MARGEN_ZOOM;
  if (ancho <= 0 || alto <= 0) return;
  const anchoArea = Math.min(ancho, alto * proporcion);
  el.zoomArea.style.width = `${anchoArea}px`;
  el.zoomArea.style.height = `${anchoArea / proporcion}px`;
}

function pintarZoom() {
  const medida = medidaArea();
  const nivel = `${Math.round(zoomLocal.escala * 100)} %`;
  el.zoomNivel.textContent = `Zoom ${nivel}`;
  el.abrirZoom.textContent = zoomLocal.escala > 1 ? `Zoom ${nivel}` : 'Zoom';
  el.abrirZoom.classList.toggle('activo', zoomLocal.escala > 1);
  if (!medida.ancho || !medida.alto) return;
  const caja = calcularCaja(limitar(zoomLocal, medida, proporcion), medida, proporcion);
  el.zoomImagen.style.left = `${caja.izquierda}px`;
  el.zoomImagen.style.top = `${caja.arriba}px`;
  el.zoomImagen.style.width = `${caja.ancho}px`;
  el.zoomImagen.style.height = `${caja.alto}px`;
}

// Muestra de inmediato la imagen ligera y la cambia por la de alta calidad en cuanto llega.
function cargarImagenZoom() {
  const indice = estado.indice;
  const sigueViendose = () => vistaAbierta === 'zoom' && estado?.indice === indice;
  delete el.zoomImagen.dataset.calidad;
  pedirImagen(indice)
    .then((url) => {
      if (sigueViendose() && !el.zoomImagen.dataset.calidad) el.zoomImagen.src = url;
    })
    .catch(() => {});
  pedirImagen(indice, true)
    .then((url) => {
      if (!sigueViendose()) return;
      el.zoomImagen.src = url;
      el.zoomImagen.dataset.calidad = 'grande';
    })
    .catch(() => {});
}

// Mientras los dedos se mueven manda lo último a un ritmo que la red aguanta.
function mandarZoomPronto() {
  if (envioZoomPendiente !== null) return;
  envioZoomPendiente = setTimeout(() => {
    envioZoomPendiente = null;
    pedir('zoom', { zoom: zoomLocal });
  }, ENVIO_ZOOM_MS);
}

function cambiarZoom(nuevo) {
  const igual = nuevo.escala === zoomLocal.escala && nuevo.cx === zoomLocal.cx && nuevo.cy === zoomLocal.cy;
  if (igual || !conectado) return;
  zoomLocal = nuevo;
  pintarZoom();
  mandarZoomPronto();
}

function acercarDesdeBoton(factor) {
  const medida = medidaArea();
  cambiarZoom(acercarEnPunto(zoomLocal, factor, medida.ancho / 2, medida.alto / 2, medida, proporcion));
}

function puntoEnArea(evento) {
  const marco = el.zoomArea.getBoundingClientRect();
  return { x: evento.clientX - marco.left, y: evento.clientY - marco.top };
}

function medirGesto() {
  const [uno, dos] = [...dedos.values()];
  if (!dos) return { ...uno, distancia: 0 };
  return { x: (uno.x + dos.x) / 2, y: (uno.y + dos.y) / 2, distancia: Math.hypot(uno.x - dos.x, uno.y - dos.y) };
}

// Solo cuenta como toque poner y quitar un dedo sin moverlo; arrastrar o usar dos dedos nunca restablece el zoom.
function terminarToque(toque) {
  const ahora = Date.now();
  const anterior = ultimoToque;
  ultimoToque = { ...toque, cuando: ahora };
  if (!anterior || ahora - anterior.cuando > DOBLE_TOQUE_MS) return;
  if (Math.hypot(toque.x - anterior.x, toque.y - anterior.y) > DOBLE_TOQUE_DISTANCIA) return;
  ultimoToque = null;
  const medida = medidaArea();
  cambiarZoom(zoomLocal.escala > 1 ? ZOOM_INICIAL : acercarEnPunto(zoomLocal, ESCALA_DOBLE_TOQUE, toque.x, toque.y, medida, proporcion));
}

function alPonerDedo(evento) {
  evento.preventDefault();
  el.zoomZona.setPointerCapture(evento.pointerId);
  const punto = puntoEnArea(evento);
  dedos.set(evento.pointerId, punto);
  gesto = medirGesto();
  toqueEnCurso = dedos.size === 1 ? punto : null;
}

function alMoverDedo(evento) {
  if (!dedos.has(evento.pointerId)) return;
  const punto = puntoEnArea(evento);
  dedos.set(evento.pointerId, punto);
  if (toqueEnCurso && Math.hypot(punto.x - toqueEnCurso.x, punto.y - toqueEnCurso.y) > DOBLE_TOQUE_DISTANCIA) toqueEnCurso = null;
  const nuevo = medirGesto();
  const medida = medidaArea();
  let zoom = zoomLocal;
  if (nuevo.distancia && gesto.distancia) {
    zoom = acercarEnPunto(zoom, nuevo.distancia / gesto.distancia, nuevo.x, nuevo.y, medida, proporcion);
  }
  zoom = desplazar(zoom, nuevo.x - gesto.x, nuevo.y - gesto.y, medida, proporcion);
  gesto = nuevo;
  cambiarZoom(zoom);
}

function alQuitarDedo(evento) {
  dedos.delete(evento.pointerId);
  gesto = dedos.size ? medirGesto() : null;
  if (!dedos.size && toqueEnCurso && evento.type === 'pointerup') terminarToque(toqueEnCurso);
  if (!dedos.size) toqueEnCurso = null;
}

/* ---------- Lista de diapositivas ---------- */

function construirLista() {
  el.lista.replaceChildren(
    ...proyecto.diapositivas.map((diapositiva, indice) => {
      const boton = document.createElement('button');
      boton.className = 'elemento-lista';
      const expositor = expositorDe(diapositiva.expositorId);
      if (expositor) boton.style.setProperty('--color-expositor', expositor.color);
      const imagen = document.createElement('img');
      imagen.alt = '';
      const etiqueta = document.createElement('span');
      etiqueta.textContent = expositor ? `${indice + 1} · ${expositor.nombre}` : String(indice + 1);
      boton.append(imagen, etiqueta);
      boton.addEventListener('click', () => {
        pedir('ir', { indice });
        abrirVista(null);
      });
      return boton;
    })
  );
}

function marcarActualEnLista() {
  [...el.lista.children].forEach((boton, indice) => boton.classList.toggle('actual', indice === estado.indice));
}

function abrirVista(vista) {
  vistaAbierta = vista;
  pintar();
  if (vista === 'zoom') {
    ajustarAreaZoom();
    cargarImagenZoom();
    pintarZoom();
  } else if (vista === 'lista') {
    marcarActualEnLista();
    cargarListaDeImagenes();
    el.lista.children[estado.indice]?.scrollIntoView({ block: 'center' });
  }
}

function pintarBotones() {
  const hay = Boolean(estado) && conectado;
  el.abrirZoom.disabled = !hay;
  el.abrirLista.disabled = !hay;
  el.anterior.disabled = !hay || estado.indice === 0;
  el.siguiente.disabled = !hay || estado.indice === estado.total - 1;
  el.negro.disabled = !hay;
  el.cronometro.disabled = !hay;
}

function pintar() {
  el.inicio.hidden = empezado;
  el.empezar.hidden = ES_APP && !conectado;
  el.escanearOtraVez.hidden = !ES_APP;
  el.espera.hidden = !empezado || Boolean(proyecto && estado);
  el.presentacion.hidden = !empezado || !(proyecto && estado);
  el.sinConexion.hidden = !empezado || conectado;
  if (!proyecto || !estado) vistaAbierta = null;
  el.vistaZoom.hidden = vistaAbierta !== 'zoom';
  el.vistaLista.hidden = vistaAbierta !== 'lista';
  pintarBotones();
  if (!proyecto || !estado) return;

  // Mientras los dedos están sobre la imagen, manda lo que hacen los dedos.
  if (!dedos.size && envioZoomPendiente === null) zoomLocal = estado.zoom;

  if (estado.indice !== pintada) {
    pintada = estado.indice;
    pintarDiapositiva(estado.indice);
  } else if (refrescarImagenes) {
    pintarMiniatura();
    if (vistaAbierta === 'zoom') cargarImagenZoom();
    if (vistaAbierta === 'lista') cargarListaDeImagenes();
  }
  refrescarImagenes = false;
  el.posicion.textContent = `${estado.indice + 1} / ${estado.total}`;
  el.avisoNegro.hidden = !estado.negro;
  el.negro.classList.toggle('activo', estado.negro);
  el.negro.setAttribute('aria-pressed', String(estado.negro));
  pintarCronometro();
  pintarZoom();
  if (vistaAbierta === 'lista') marcarActualEnLista();
}

/* ---------- Conexión ---------- */

const MENSAJES = {
  // Se vuelve a recibir cada vez que otro celular se conecta: si no cambió, el texto no se mueve de donde iba.
  presentacion(mensaje) {
    const recibida = JSON.stringify(mensaje);
    if (recibida === presentacionRecibida) return;
    presentacionRecibida = recibida;
    olvidarImagenes();
    proyecto = mensaje;
    pintada = null;
    construirLista();
  },
  estado(mensaje) {
    estado = mensaje;
    estadoRecibidoEn = Date.now();
  },
  'imagen-no-disponible'({ id }) {
    terminarPedido(id)?.rechazar(new Error('Imagen no disponible'));
  },
  'sin-presentacion'() {
    presentacionRecibida = null;
    olvidarImagenes();
    proyecto = null;
    estado = null;
    pintada = null;
  },
};

function conectar() {
  if (conexion || !direccionMensajes) return;
  let socket;
  try {
    socket = new WebSocket(direccionMensajes);
  } catch {
    decir('Chrome no permitió conectar con la laptop.');
    return;
  }
  socket.binaryType = 'arraybuffer';
  conexion = socket;
  ultimoLatido = Date.now();
  socket.addEventListener('open', () => {
    if (conexion !== socket) return;
    conectado = true;
    refrescarImagenes = true;
    ultimoLatido = Date.now();
    if (entrarAlConectar) empezar();
    entrarAlConectar = false;
    decir('');
    pintar();
  });
  socket.addEventListener('message', ({ data }) => {
    if (conexion !== socket) return;
    ultimoLatido = Date.now();
    if (data instanceof ArrayBuffer) {
      recibirImagen(data);
      return;
    }
    const mensaje = JSON.parse(data);
    const atender = MENSAJES[mensaje.tipo];
    if (!atender) return;
    atender(mensaje);
    pintar();
  });
  socket.addEventListener('close', () => {
    if (conexion !== socket) return;
    conexion = null;
    conectado = false;
    cancelarPedidos();
    if (entrarAlConectar) decir('No se pudo conectar. Revisa que la laptop esté en el hotspot y que Atril muestre el código.');
    pintar();
    setTimeout(conectar, REINTENTO_MS);
  });
}

// Una red que se cae no siempre avisa: si la laptop deja de responder, se vuelve a intentar.
setInterval(() => {
  if (conexion && Date.now() - ultimoLatido > SIN_LATIDO_MS) conexion.close();
  pintarCronometro();
}, 500);

// Los comandos no se guardan para después: si no hay conexión, los botones se desactivan
// y la presentación no salta al volver la señal.
function pedir(comando, datos = {}) {
  if (conectado && conexion?.readyState === WebSocket.OPEN) {
    conexion.send(JSON.stringify({ tipo: 'comando', comando, ...datos }));
  }
}

/* ---------- Eventos ---------- */

function empezar() {
  empezado = true;
  mantenerEncendida();
  pedirPantallaCompleta();
  pintar();
}

el.empezar.addEventListener('click', empezar);

// Windows o Android pueden sacar la app de pantalla completa; el siguiente toque la regresa.
document.addEventListener('click', () => {
  if (empezado) pedirPantallaCompleta();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !empezado) return;
  mantenerEncendida();
  conectar();
});

el.anterior.addEventListener('click', () => pedir('anterior'));
el.siguiente.addEventListener('click', () => pedir('siguiente'));
el.negro.addEventListener('click', () => pedir('negro'));
el.cronometro.addEventListener('click', () => pedir(estado?.corriendo ? 'cronometroPausar' : 'cronometroReanudar'));

function cambiarTamano(diferencia) {
  tamano = Math.min(TAMANO_MAXIMO, Math.max(TAMANO_MINIMO, tamano + diferencia));
  guardarAjuste(CLAVE_TAMANO, String(tamano));
  aplicarAjustes();
}

el.letraMenos.addEventListener('click', () => cambiarTamano(-PASO_TAMANO));
el.letraMas.addEventListener('click', () => cambiarTamano(PASO_TAMANO));
el.contraste.addEventListener('click', () => {
  contraste = CONTRASTES[(CONTRASTES.indexOf(contraste) + 1) % CONTRASTES.length];
  guardarAjuste(CLAVE_CONTRASTE, contraste);
  aplicarAjustes();
});

el.abrirZoom.addEventListener('click', () => abrirVista('zoom'));
el.zoomCerrar.addEventListener('click', () => abrirVista(null));
el.zoomMenos.addEventListener('click', () => acercarDesdeBoton(1 / FACTOR_BOTON_ZOOM));
el.zoomMas.addEventListener('click', () => acercarDesdeBoton(FACTOR_BOTON_ZOOM));
el.zoomReiniciar.addEventListener('click', () => {
  zoomLocal = ZOOM_INICIAL;
  pintarZoom();
  pedir('zoomReiniciar');
});
el.zoomImagen.addEventListener('load', () => {
  if (el.zoomImagen.naturalWidth) proporcion = el.zoomImagen.naturalWidth / el.zoomImagen.naturalHeight;
  ajustarAreaZoom();
  pintarZoom();
});
el.zoomZona.addEventListener('pointerdown', alPonerDedo);
el.zoomZona.addEventListener('pointermove', alMoverDedo);
el.zoomZona.addEventListener('pointerup', alQuitarDedo);
el.zoomZona.addEventListener('pointercancel', alQuitarDedo);
window.addEventListener('resize', () => {
  ajustarAreaZoom();
  pintarZoom();
});

el.abrirLista.addEventListener('click', () => abrirVista('lista'));
el.listaCerrar.addEventListener('click', () => abrirVista(null));

/* ---------- App instalada: instalar y escanear ---------- */

let avisoInstalar = null;
let entrarAlConectar = false;
let flujoCamara = null;
let temporizadorEscaneo = null;

function decir(texto) {
  el.mensaje.textContent = texto;
}

const estaInstalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

function pintarInicioDeApp() {
  el.inicioTexto.textContent = 'Escanea el código que muestra Atril en la laptop.';
  el.escanear.hidden = !el.camara.hidden;
  el.manualOpcion.hidden = false;
  el.instalar.hidden = estaInstalada() || !avisoInstalar;
  el.ayudaInstalar.hidden = estaInstalada() || Boolean(avisoInstalar);
}

// Solo acepta códigos de Atril en la red local; cualquier otro QR se ignora.
function leerDireccion(texto) {
  let url;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  const partes = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'http:' || !ES_PRIVADA.test(url.hostname) || partes.length !== 1) return null;
  return `ws://${url.host}/${partes[0]}/ws`;
}

function usarDireccion(direccion) {
  direccionMensajes = direccion;
  guardarAjuste(CLAVE_DIRECCION, direccion);
  const anterior = conexion;
  conexion = null;
  conectado = false;
  anterior?.close();
  cancelarPedidos();
  entrarAlConectar = true;
  decir('Conectando… Si Chrome pregunta por dispositivos de tu red local, toca Permitir.');
  mantenerEncendida();
  conectar();
}

function apagarCamara() {
  clearInterval(temporizadorEscaneo);
  flujoCamara?.getTracks().forEach((pista) => pista.stop());
  flujoCamara = null;
  el.video.srcObject = null;
  el.camara.hidden = true;
  pintarInicioDeApp();
}

async function escanear() {
  decir('');
  pedirPantallaCompleta();
  mantenerEncendida();
  if (!('BarcodeDetector' in window)) {
    decir('Este navegador no puede leer el código. Escribe la dirección a mano.');
    return;
  }
  try {
    flujoCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    decir('Atril necesita permiso de cámara para leer el código.');
    return;
  }
  el.camara.hidden = false;
  pintarInicioDeApp();
  el.video.srcObject = flujoCamara;
  await el.video.play();

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  temporizadorEscaneo = setInterval(async () => {
    const codigos = await detector.detect(el.video).catch(() => []);
    for (const { rawValue } of codigos) {
      const direccion = leerDireccion(rawValue);
      if (direccion) {
        apagarCamara();
        usarDireccion(direccion);
        return;
      }
      decir('Ese código no es de Atril.');
    }
  }, ESCANEO_MS);
}

if (ES_APP) {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    avisoInstalar = evento;
    pintarInicioDeApp();
  });
  window.addEventListener('appinstalled', () => {
    avisoInstalar = null;
    pintarInicioDeApp();
    decir('Listo. Abre Atril desde la pantalla principal de tu celular.');
  });
  el.instalar.addEventListener('click', async () => {
    await avisoInstalar?.prompt();
    avisoInstalar = null;
    pintarInicioDeApp();
  });
  el.escanear.addEventListener('click', escanear);
  el.cancelarCamara.addEventListener('click', apagarCamara);
  el.escanearOtraVez.addEventListener('click', () => {
    empezado = false;
    pintar();
    escanear();
  });
  el.manual.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const direccion = leerDireccion(el.direccion.value);
    pedirPantallaCompleta();
    if (direccion) usarDireccion(direccion);
    else decir('Esa dirección no es de Atril.');
  });

  // Guarda la app para que abra sin internet; si llega una versión nueva, entra sin esperar.
  const yaTeniaVersion = Boolean(navigator.serviceWorker?.controller);
  navigator.serviceWorker?.register('sw.js').catch(() => decir('No se pudo preparar el uso sin internet.'));
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (yaTeniaVersion && !conectado) location.reload();
  });
  pintarInicioDeApp();
}

aplicarAjustes();
pintar();
conectar();
