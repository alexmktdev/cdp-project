/**
 * Configuración e inicialización de Firebase: Auth, Firestore y Storage.
 * Este archivo centraliza la conexión con los servicios de Firebase para toda la aplicación.
 *
 * SEGURIDAD (cliente):
 * - La configuración usa variables NEXT_PUBLIC_* (expuestas al cliente); no incluir secretos aquí.
 * - La autenticación real la hace Firebase Auth (servidores Google); las contraseñas no pasan por nuestro backend.
 * - Tras login exitoso se comprueba en Firestore que el usuario esté activo (active !== false) antes de establecer la sesión.
 * - El token de sesión se envía al servidor solo vía POST /api/auth/session para guardarlo en cookie httpOnly (no en localStorage).
 */
import { initializeApp } from "firebase/app"
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type UserCredential,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import { getFirestore, Timestamp, doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { getStorage } from "firebase/storage"

/**
 * Configuración de Firebase obtenida de las variables de entorno.
 * SEGURIDAD: Usar solo variables NEXT_PUBLIC_* aquí; nunca poner claves privadas o FIREBASE_ADMIN_CREDENTIALS en el cliente.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Inicialización de la aplicación de Firebase
const firebaseApp = initializeApp(firebaseConfig)

// Exportación de instancias de servicios para su uso en otros archivos
const auth = getAuth(firebaseApp)
const db = getFirestore(firebaseApp)
const storage = getStorage(firebaseApp)

/**
 * Verificación de FORMATO del token (uso en middleware u otras comprobaciones ligeras).
 * SEGURIDAD: Esto NO valida firma ni expiración; la verificación real se hace en el servidor con Admin SDK verifyIdToken().
 */
export const verifyToken = async (token: string): Promise<boolean> => {
  try {
    // Implementación simplificada para validación de formato
    return token.length > 20 && token.includes(".")
  } catch (error) {
    console.error("Error al verificar token:", error)
    return false
  }
}

/** 
 * Interfaz para las credenciales de inicio de sesión.
 */
interface AuthCredentials {
  email: string
  password: string
}

/** 
 * Tipo para el resultado de la operación de login.
 * Puede ser un éxito con las credenciales del usuario o un fallo con un mensaje de error.
 */
export type LoginResult =
  | { success: true; userCredential: UserCredential }
  | { success: false; error: string; code?: string }

/** 
 * Función principal para el inicio de sesión de usuarios.
 * 1. Autentica con Firebase Auth.
 * 2. Verifica si el usuario existe y está activo en Firestore.
 * 3. Actualiza la fecha de última conexión.
 * 4. Crea una sesión en el servidor mediante una cookie.
 */
export const login = async ({ email, password }: AuthCredentials): Promise<LoginResult> => {
  let userCredential: UserCredential
  try {
    // Intento de autenticación con correo y contraseña
    userCredential = await signInWithEmailAndPassword(auth, email, password)
  } catch (err: unknown) {
    // Manejo de errores específicos de Firebase Auth
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : ""
    
    // SEGURIDAD: No revelar si el error fue email o contraseña; mensaje genérico reduce enumeración de usuarios.
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      return {
        success: false,
        error: "Correo o contraseña incorrecta, revise, e intente nuevamente!",
        code: "invalid-credential",
      }
    }
    
    // SEGURIDAD: Firebase aplica rate limiting; informar al usuario que use "Olvidé contraseña" evita fuerza bruta.
    if (code === "auth/too-many-requests") {
      return {
        success: false,
        error: "Cuenta bloqueada por demasiados intentos fallidos. Restablece tu contraseña usando la opción «¿Olvidaste tu contraseña?». Verifique también el correo cuando lo ingrese de forma errónea.",
        code: "too-many-requests",
      }
    }
    throw err
  }

  // SEGURIDAD: Comprobar que el usuario exista en Firestore y esté activo antes de dar sesión.
  // Un admin puede desactivar una cuenta (active: false); aquí se rechaza el login y se cierra Auth.
  const userRef = doc(db, "users", userCredential.user.uid)
  const userDoc = await getDoc(userRef)

  if (userDoc.exists()) {
    const userData = userDoc.data()

    if (userData.active === false) {
      await signOut(auth)
      return { success: false, error: "Usuario inactivo. Contacte al administrador." }
    }

    // Actualización de la marca de tiempo de la última conexión
    await updateDoc(userRef, {
      lastConnection: serverTimestamp(),
    })
  }

  // SEGURIDAD: El token se envía al servidor para guardarlo en cookie httpOnly; el cliente no lo almacena en localStorage.
  const idToken = await userCredential.user.getIdToken()

  // Llamada a la API interna para establecer la cookie de sesión
  await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: idToken }),
  })

  return { success: true, userCredential }
}

/** 
 * Envía un correo electrónico para restablecer la contraseña.
 * @param email Correo del usuario que solicita el restablecimiento.
 */
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (error) {
    console.error("Error al enviar el correo de restablecimiento:", error)
    throw error
  }
}

/** 
 * Cierra la sesión del usuario tanto en el cliente como en el servidor.
 * SEGURIDAD: 1) Borrar cookie en servidor (POST /api/auth/logout) para que el middleware ya no considere sesión.
 *            2) signOut(auth) limpia estado en Firebase en el cliente.
 *            3) location.href (no router.push) fuerza recarga y limpia estado en memoria, evitando fugas.
 */
export const logOut = async (): Promise<void> => {
  try {
    // Petición para eliminar la cookie de sesión
    await fetch("/api/auth/logout", {
      method: "POST",
    })

    // Cierre de sesión en Firebase
    await signOut(auth)

    // Redirección forzada para limpiar el estado de la aplicación
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
  } catch (error) {
    console.error("Error durante el logout:", error)
    // Intento de redirección incluso si falla la petición a la API
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
    throw error
  }
}

/** 
 * Suscripción en tiempo real a los cambios de estado de autenticación.
 * @param callback Función que se ejecuta cada vez que el usuario inicia o cierra sesión.
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback)
}

// Re-exportación de utilidades y tipos de Firebase para uso global
export { auth, db, storage, Timestamp, serverTimestamp, signOut }
