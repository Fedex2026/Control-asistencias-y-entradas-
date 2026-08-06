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

export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",

  authDomain: "PEGA_AQUI.firebaseapp.com",

  projectId: "PEGA_AQUI",

  storageBucket: "PEGA_AQUI.appspot.com",

  messagingSenderId: "PEGA_AQUI",

  appId: "PEGA_AQUI"
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
