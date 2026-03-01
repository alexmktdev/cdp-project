/**
 * API de cierre de sesión: elimina la cookie "session" en el servidor.
 *
 * SEGURIDAD:
 * - Debe usar el mismo name, path, httpOnly, secure y sameSite que al establecer la cookie,
 *   con maxAge: 0 y value: "", para que el navegador la elimine correctamente.
 * - Cualquiera puede llamar POST (no se verifica token); no es problema: solo borra la cookie
 *   del propio cliente. Si no había cookie, no tiene efecto. Evita dejar sesión abierta al cerrar pestaña
 *   si el cliente llama logout antes.
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

/** Manejador POST: borra la cookie de sesión. SEGURIDAD: maxAge: 0 y value "" con mismo path/opciones que session. */
export async function POST() {
  try {
    const cookieStore = await cookies()
    cookieStore.set({
      name: "session",
      value: "",
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error al cerrar sesión (borrar cookie):", error)
    return NextResponse.json({ success: false, error: "Error al cerrar sesión" }, { status: 500 })
  }
}

