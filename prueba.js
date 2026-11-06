// Prueba mínima: ¿una app instalada desde internet puede hablar con Atril en la red local, sin internet?
// La dirección y el código secreto del QR se quedan en este celular; nada de esto se manda a ningún sitio web.
const ESPERA_CONEXION_MS = 45000;
const ESCANEO_MS = 300;

const el = Object.fromEntries(
  ['paso-instalada', 'paso-qr', 'paso-conexion', 'instalar', 'ayuda-instalar', 'escanear', 'camara', 'video', 'cancelar', 'manual', 'direccion', 'mensaje', 'control', 'posicion', 'texto', 'anterior', 'siguiente', 'detalles'].map((id) => [
    id,
    document.getElementById(id),
  ])
);

const instalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

function marcar(elemento, texto, resultado) {
  elemento.textContent = `${resultado === 'bien' ? '✓' : resultado === 'mal' ? '✗' : '•'} ${texto}`;
  elemento.classList.toggle('bien', resultado === 'bien');
  elemento.classList.toggle('mal', resultado === 'mal');
}

const decir = (texto) => {
  el.mensaje.textContent = texto;
};

/* ---------- Instalación ---------- */

let avisoInstalar = null;

function pintarInstalacion() {
  marcar(el['paso-instalada'], instalada() ? 'Instalada: abre sin Chrome' : 'Falta instalar la app', instalada() ? 'bien' : 'pendiente');
  el.instalar.hidden = instalada() || !avisoInstalar;
  el['ayuda-instalar'].hidden = instalada() || Boolean(avisoInstalar);
}

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  avisoInstalar = evento;
  pintarInstalacion();
});

window.addEventListener('appinstalled', () => {
  avisoInstalar = null;
  decir('Listo. Abre Atril desde la pantalla principal de tu celular.');
  el.instalar.hidden = true;
  el['ayuda-instalar'].hidden = true;
});

el.instalar.addEventListener('click', async () => {
  await avisoInstalar?.prompt();
  avisoInstalar = null;
  pintarInstalacion();
});

navigator.serviceWorker?.register('sw.js').catch((error) => decir(`No se pudo preparar el uso sin internet: ${error.message}`));

/* ---------- Dirección de la laptop ---------- */

const ES_PRIVADA = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

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

/* ---------- Cámara ---------- */

let flujo = null;
let temporizadorEscaneo = null;

function apagarCamara() {
  clearInterval(temporizadorEscaneo);
  flujo?.getTracks().forEach((pista) => pista.stop());
  flujo = null;
  el.video.srcObject = null;
  el.camara.hidden = true;
  el.escanear.hidden = false;
}

async function escanear() {
  decir('');
  if (!('BarcodeDetector' in window)) {
    marcar(el['paso-qr'], 'Este navegador no puede leer el código QR', 'mal');
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (error) {
    marcar(el['paso-qr'], `Sin permiso de cámara (${error.name})`, 'mal');
    return;
  }
  el.camara.hidden = false;
  el.escanear.hidden = true;
  el.video.srcObject = flujo;
  await el.video.play();

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  temporizadorEscaneo = setInterval(async () => {
    const codigos = await detector.detect(el.video).catch(() => []);
    for (const { rawValue } of codigos) {
      const direccion = leerDireccion(rawValue);
      if (direccion) {
        apagarCamara();
        marcar(el['paso-qr'], 'Código QR leído dentro de la app', 'bien');
        conectar(direccion);
        return;
      }
      decir('Ese código no es de Atril.');
    }
  }, ESCANEO_MS);
}

el.escanear.addEventListener('click', escanear);
el.cancelar.addEventListener('click', apagarCamara);

/* ---------- Conexión ---------- */

let conexion = null;
let conectada = false;
let presentacion = null;
let estado = null;

async function pintarDetalles(extra = '') {
  let permiso = 'sin dato';
  try {
    permiso = (await navigator.permissions.query({ name: 'local-network' })).state;
  } catch {
    // Este navegador no informa ese permiso.
  }
  const version = navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? 'otro navegador';
  el.detalles.textContent = `${version} · permiso de red local: ${permiso}${extra ? ` · ${extra}` : ''}`;
}

function pintarControl() {
  el.control.hidden = !conectada;
  if (!presentacion || !estado) {
    el.posicion.textContent = 'Conectado. Haz clic en Presentar en la laptop.';
    el.texto.hidden = true;
    return;
  }
  el.texto.hidden = false;
  el.posicion.textContent = `${estado.indice + 1} / ${estado.total}`;
  const notas = presentacion.diapositivas[estado.indice]?.notas.trim();
  el.texto.textContent = notas || 'Esta diapositiva no tiene texto.';
}

const AL_RECIBIR = {
  presentacion(mensaje) {
    presentacion = mensaje;
  },
  estado(mensaje) {
    estado = mensaje;
  },
  'sin-presentacion'() {
    presentacion = null;
    estado = null;
  },
};

function conectar(direccion) {
  conexion?.close();
  conectada = false;
  pintarControl();
  marcar(el['paso-conexion'], 'Conectando con la laptop…', 'pendiente');
  decir('Si Chrome pregunta por dispositivos de tu red local, toca Permitir.');

  let socket;
  try {
    socket = new WebSocket(direccion);
  } catch (error) {
    marcar(el['paso-conexion'], 'Chrome bloqueó la conexión con la laptop', 'mal');
    decir('');
    pintarDetalles(error.name);
    return;
  }
  conexion = socket;
  const limite = setTimeout(() => socket.close(), ESPERA_CONEXION_MS);

  socket.addEventListener('open', () => {
    clearTimeout(limite);
    conectada = true;
    marcar(el['paso-conexion'], 'Conectada con la laptop', 'bien');
    decir('');
    pintarControl();
    pintarDetalles();
  });
  socket.addEventListener('message', ({ data }) => {
    const mensaje = JSON.parse(data);
    const atender = AL_RECIBIR[mensaje.tipo];
    if (!atender) return;
    atender(mensaje);
    pintarControl();
  });
  socket.addEventListener('close', (evento) => {
    clearTimeout(limite);
    if (conexion !== socket) return;
    const estabaConectada = conectada;
    conectada = false;
    pintarControl();
    marcar(el['paso-conexion'], estabaConectada ? 'Se perdió la conexión con la laptop' : 'No se pudo conectar con la laptop', 'mal');
    decir(estabaConectada ? 'Vuelve a escanear el código.' : 'Revisa que la laptop esté en el hotspot y que Atril 1.4.0 muestre el código. Si tocaste Bloquear, cambia el permiso de red local en los ajustes de la app.');
    pintarDetalles(`código ${evento.code}`);
  });
}

const pedir = (comando) => {
  if (conectada) conexion.send(JSON.stringify({ tipo: 'comando', comando }));
};

el.siguiente.addEventListener('click', () => pedir('siguiente'));
el.anterior.addEventListener('click', () => pedir('anterior'));

el.manual.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const direccion = leerDireccion(el.direccion.value);
  if (direccion) conectar(direccion);
  else decir('Esa dirección no es de Atril.');
});

/* ---------- Inicio ---------- */

marcar(el['paso-qr'], 'Falta escanear el código', 'pendiente');
marcar(el['paso-conexion'], 'Falta conectar con la laptop', 'pendiente');
pintarInstalacion();
pintarDetalles();
window.matchMedia('(display-mode: standalone)').addEventListener('change', pintarInstalacion);
