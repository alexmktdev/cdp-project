"use client"

/**
 * Página del historial de CDPs (Certificados de Disponibilidad Presupuestaria).
 * Carga el componente historial-form de forma dinámica sin SSR.
 * Si el usuario está vinculado a un funcionario emisor inactivo (useCanCreateCDP), muestra mensaje y no permite acceder al historial.
 */
import dynamic from "next/dynamic"
import Link from "next/link"
import { Loader2, Package, AlertCircle, LayoutDashboard } from "lucide-react"
import { useCanCreateCDP } from "@/hooks/use-can-create-cdp"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const HistorialCDPForm = dynamic(() => import("./historial-form"), {
  loading: () => (
    <div className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Package className="h-7 w-7 text-[#1a2da6]" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Historial de CDPs
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

export default function HistorialCDPPage() {
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
                  No puede acceder al Historial CDP
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

  return <HistorialCDPForm />
}
