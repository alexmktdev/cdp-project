/**
 * Página de inicio (Raíz).
 * Este componente se encarga de la redirección inicial del usuario.
 * Como es un Server Component, puede acceder a las cookies de forma directa y segura.
 */
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function HomePage() {
  // Verificamos si existe la cookie de sesión en el navegador del usuario
  const cookieStore = await cookies()
  const hasSession = cookieStore.has("session")

  // Lógica de redirección:
  // - Si el usuario ya tiene una sesión iniciada, lo enviamos al Dashboard.
  // - Si no tiene sesión, lo enviamos a la página de Login.
  if (hasSession) {
    redirect("/dashboard")
  } else {
    redirect("/login")
  }
}
