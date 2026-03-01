"use client"

/**
 * Layout de rutas protegidas (dashboard, cdp, configuracion, users, etc.).
 *
 * SEGURIDAD:
 * - Depende del middleware para rechazar peticiones sin cookie en estas rutas; además en cliente
 *   se usa useAuth() y checkSession() para asegurar que hay usuario y que está activo.
 * - checkSession() se ejecuta al montar y cada 5 minutos (setInterval). Si el usuario fue
 *   desactivado en Firestore o la sesión es inválida, checkSession devuelve false y se redirige a /login.
 * - Si !user o user.active === false, se redirige a /login y no se renderiza contenido (return null después del loader).
 * - Mientras loading === true se muestra solo un loader; no se muestra sidebar ni children hasta tener usuario válido.
 * - Así se evita fugas de contenido protegido por un breve instante o por sesión caducada/desactivada.
 */
import type React from "react"

import { useAuth } from "@/context/auth-context"
import { Sidebar } from "@/components/sidebar"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { SidebarProvider } from "@/hooks/use-sidebar"

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { user, loading, checkSession } = useAuth()
  const router = useRouter()

  // SEGURIDAD: Verificación periódica de sesión (cada 5 min) para detectar desactivación de cuenta o token inválido.
  useEffect(() => {
    const checkSessionStatus = async () => {
      try {
        const isValid = await checkSession()
        if (!isValid && !loading) {
          router.push("/login")
        }
      } catch (error) {
        console.error("Error al verificar estado de sesión:", error)
      }
    }

    if (!loading) {
      checkSessionStatus()
    }

    const intervalId = setInterval(checkSessionStatus, 5 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [router, checkSession, loading])

  // SEGURIDAD: No mostrar contenido protegido si no hay usuario o el usuario está inactivo.
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }

    if (!loading && user && user.active === false) {
      router.push("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // SEGURIDAD: Doble compuerta — si no hay user o está inactivo, no renderizar nada (evita flash de contenido).
  if (!user || user.active === false) {
    return null
  }

  // Contenido protegido: sidebar + área principal
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 w-full ml-0 md:ml-64 transition-all duration-300">
          <main className="flex-1 p-4 md:p-6 w-full overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
