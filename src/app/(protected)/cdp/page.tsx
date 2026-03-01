"use client"

/**
 * Página principal para crear un CDP (Certificado de Disponibilidad Presupuestaria).
 * - Carga el formulario (cdp-form) de forma dinámica sin SSR para evitar problemas con Firebase en el servidor.
 * - Usa useCanCreateCDP: si el usuario está vinculado a un funcionario emisor inactivo, muestra un mensaje y no permite crear CDP.
 * - Si puede crear: renderiza CrearCDPForm; si no: muestra tarjeta explicativa y enlace al dashboard.
 */
import dynamic from "next/dynamic"
import Link from "next/link"
import { Loader2, FileText, AlertCircle, LayoutDashboard } from "lucide-react"
import { useCanCreateCDP } from "@/hooks/use-can-create-cdp"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const CrearCDPForm = dynamic(() => import("./cdp-form"), {
  loading: () => (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <FileText className="h-7 w-7 text-[#1a2da6]" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Crear CDP (Certificado de Disponibilidad Presupuestaria)
          </h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
        </div>
      </div>
    </div>
  ),
  ssr: false,
})

export default function CrearCDPPage() {
  const { canCreateCDP, loading } = useCanCreateCDP()

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
      </div>
    )
  }

  if (!canCreateCDP) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-10 w-10 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  No puede crear CDP
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Su usuario está vinculado a un funcionario emisor que no está activo en <strong>Configuración → Funcionarios Emisores</strong>.
                  Solo un SuperAdmin del sistema puede activar o desactivar quién emite CDPs.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Ir al Panel de Control
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <CrearCDPForm />
}
