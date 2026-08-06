/*
  CONFIGURACIÓN DE FIREBASE

  1. Entra a Firebase Console.
  2. Abre tu proyecto.
  3. Ve a Configuración del proyecto.
  4. Entra a Tus aplicaciones.
  5. Selecciona o crea una aplicación web.
  6. Copia los datos de firebaseConfig.
  7. Sustituye los datos de ejemplo de abajo.
*/

const firebaseConfig = {
  apiKey: "AIzaSyAG1UPUKECymTZ3aifFQuyN_mbviYjm2Q4",
  authDomain: "control-asistencias-y-entradas.firebaseapp.com",
  databaseURL: "https://control-asistencias-y-entradas-default-rtdb.firebaseio.com",
  projectId: "control-asistencias-y-entradas",
  storageBucket: "control-asistencias-y-entradas.firebasestorage.app",
  messagingSenderId: "420567524268",
  appId: "1:420567524268:web:5ec9a3e319ec56a6395009"
};

/*
  WEBHOOK OPCIONAL PARA WHATSAPP

  Déjalo vacío si solamente quieres que la web abra WhatsApp
  con el mensaje preparado.

  Para mandar el mensaje automáticamente necesitas conectar
  una Firebase Function o un proveedor autorizado de WhatsApp.

  Ejemplo:

  export const notificationWebhookUrl =
    "https://us-central1-tu-proyecto.cloudfunctions.net/notifyAttendance";
*/

export const notificationWebhookUrl = "";
