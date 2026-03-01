/**
 * Layout raíz de la aplicación (App Router de Next.js).
 * Envuelve toda la app con: fuente Inter, estilos globales (globals.css) y AuthProvider.
 * El AuthProvider permite que cualquier componente acceda al estado del usuario logueado.
 */
import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/context/auth-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Dirección de Administración y Finanzas - Departamento de Adquisiciones",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
          <AuthProvider>
            {children}
          </AuthProvider>
      </body>
    </html>
  )
}
