/**
 * API de Gestión de Sesión (Cookies).
 *
 * SEGURIDAD:
 * - POST: Recibe el JWT de Firebase y lo guarda en una cookie. La cookie se configura con:
 *   httpOnly: true  → no accesible desde JavaScript (mitiga robo de token vía XSS).
 *   secure: true en producción → solo se envía por HTTPS.
 *   sameSite: "lax" → se envía en navegación same-site y top-level GET desde otros sitios; reduce CSRF.
 *   maxAge 7 días y path "/" para que el middleware pueda leerla en todas las rutas.
 * - No se verifica aquí el JWT; se confía en que el cliente solo llama tras login() exitoso.
 *   La verificación real del token se hace en otras APIs (users/create, users/list) con verifyIdToken().
 *
 * GET: Solo comprueba existencia de la cookie; no valida firma/expiración (uso para comprobaciones rápidas).
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** 
 * Manejador POST: Establece la cookie de sesión.
 * Se llama desde el cliente después de un inicio de sesión exitoso en Firebase.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = body?.token
    
    // SEGURIDAD: Validación de entrada — rechazar body sin token o con tipo incorrecto (evita inyección de valor no string).
    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Token requerido" }, { status: 400 })
    }

    // SEGURIDAD: Opciones de la cookie — httpOnly (no JS), secure en prod, sameSite lax, path y maxAge coherentes con logout.
    const cookieStore = await cookies()
    cookieStore.set({
      name: "session",
      value: token,
      httpOnly: true, // La cookie no es accesible vía JavaScript (Seguridad)
      secure: process.env.NODE_ENV === "production", // Solo se envía por HTTPS en producción
      sameSite: "lax", // Protección contra CSRF
      maxAge: 60 * 60 * 24 * 7, // Duración: 1 semana
      path: "/", // Disponible en toda la aplicación
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error al establecer la sesión:", error)
    return NextResponse.json({ success: false, error: "Error al establecer la sesión" }, { status: 500 })
  }
}

/** 
 * GET: Comprueba si existe cookie "session". SEGURIDAD: No se verifica el JWT aquí;
 * devuelve 401 si no hay cookie. Para autorización real usar verifyIdToken en la API concreta.
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")

    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error("Error al verificar la sesión:", error)
    return NextResponse.json({ valid: false }, { status: 401 })
  }
}
