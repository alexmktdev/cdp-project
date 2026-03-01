/**
 * Componente de carga (Suspense fallback) para la ruta /cdp (Crear CDP).
 * Se muestra mientras la página o el formulario dinámico se están cargando.
 */
import { Loader2, FileText } from "lucide-react"

export default function LoadingCDP() {
  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <FileText className="h-7 w-7 text-[#1a2da6]" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Crear CDP
          </h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
        </div>
      </div>
    </div>
  )
}
