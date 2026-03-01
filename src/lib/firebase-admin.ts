/**
 * Inicialización y acceso a Firebase Admin SDK (solo servidor).
 *
 * SEGURIDAD:
 * - Este módulo NO debe importarse en el cliente; solo en rutas API o código server-side.
 * - FIREBASE_ADMIN_CREDENTIALS debe ser el JSON de la cuenta de servicio (clave privada);
 *   NUNCA exponerlo en NEXT_PUBLIC_* ni en el bundle del cliente.
 * - Se usa para: verifyIdToken (validar JWT de la cookie), createUser, y leer/escribir Firestore
 *   sin restricciones de reglas (bypass de reglas del cliente). Por eso las APIs que crean
 *   usuarios o listan todos los usuarios deben comprobar rol (sa/admin) después de verifyIdToken.
 */
import * as admin from "firebase-admin"

/** Indica si la aplicación Admin ya fue inicializada para evitar hacerlo más de una vez */
let initialized = false

/**
 * Asegura que Firebase Admin esté inicializado antes de usarlo.
 * SEGURIDAD: La variable FIREBASE_ADMIN_CREDENTIALS debe ser un JSON válido de cuenta de servicio.
 * Se valida que empiece por "{" para evitar inyección de otro tipo de valor. El parse puede lanzar
 * si el JSON es inválido; no se expone el contenido en mensajes de error.
 */
function ensureInitialized() {
  if (initialized) return

  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS
  if (!raw || typeof raw !== "string") {
    throw new Error("FIREBASE_ADMIN_CREDENTIALS no está configurada")
  }
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) {
    throw new Error("FIREBASE_ADMIN_CREDENTIALS debe ser un JSON válido (objeto)")
  }
  try {
    const serviceAccount = JSON.parse(raw)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    initialized = true
  } catch (e) {
    throw new Error("FIREBASE_ADMIN_CREDENTIALS: JSON inválido. Revise la variable en Vercel.")
  }
}

/** 
 * Devuelve la instancia de Auth de Firebase Admin.
 * SEGURIDAD: Usar verifyIdToken() para validar el JWT de la cookie; comprueba firma, expiración y emisor.
 */
export function getAdminAuth() {
  if (!admin.apps.length) ensureInitialized()
  return admin.auth()
}

/** 
 * Devuelve la instancia de Firestore de Firebase Admin (bypass de reglas del cliente).
 * SEGURIDAD: Solo usar en servidor; autorizar al usuario (p. ej. por rol) en la API antes de leer/escribir.
 */
export function getAdminDb() {
  if (!admin.apps.length) ensureInitialized()
  return admin.firestore()
}
