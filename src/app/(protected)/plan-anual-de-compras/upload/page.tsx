"use client"

/**
 * Página de carga masiva del Plan Anual de Compras.
 * Permite subir un archivo JSON con un array de proyectos (projectName, goodOrServiceName, department, purchaseType, preparationMonth, publicationMonth).
 * Valida la estructura antes de guardar cada documento en la colección Firestore "planAnualCompras".
 */
import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload, CheckCircle, AlertCircle, FileText, X } from "lucide-react"
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"
import { toast } from "sonner"

/** Un proyecto del plan anual (estructura esperada en el JSON de carga) */
interface ProjectData {
  projectName: string
  goodOrServiceName: string
  department: string
  purchaseType: string
  preparationMonth: string
  publicationMonth: string
}

export default function UploadPlanAnualPage() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [isValidating, setIsValidating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Lee el JSON, valida que sea array de objetos con campos requeridos y guarda en state para subir */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".json")) {
      toast.error("Por favor, seleccione un archivo JSON")
      return
    }

    setFileName(file.name)
    setIsValidating(true)
    setValidationErrors([])
    setProjects([])

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // Validar que sea un array
      if (!Array.isArray(data)) {
        setValidationErrors(["El archivo JSON debe contener un array de objetos"])
        setIsValidating(false)
        return
      }

      // Validar estructura de cada objeto
      const validationErrorsList: string[] = []
      const validProjects: ProjectData[] = []

      data.forEach((item, index) => {
        if (typeof item !== "object" || item === null) {
          validationErrorsList.push(`Línea ${index + 1}: No es un objeto válido`)
          return
        }

        const project: ProjectData = {
          projectName: item.projectName || "",
          goodOrServiceName: item.goodOrServiceName || "",
          department: item.department || "",
          purchaseType: item.purchaseType || "",
          preparationMonth: item.preparationMonth || "",
          publicationMonth: item.publicationMonth || "",
        }

        // Validar campos requeridos
        if (!project.goodOrServiceName) {
          validationErrorsList.push(`Línea ${index + 1}: Falta el campo 'goodOrServiceName'`)
        }

        validProjects.push(project)
      })

      if (validationErrorsList.length > 0) {
        setValidationErrors(validationErrorsList)
        toast.warning(`Se encontraron ${validationErrorsList.length} errores de validación`)
      } else {
        toast.success(`Archivo cargado correctamente: ${data.length} proyectos encontrados`)
      }

      setProjects(validProjects)
    } catch (error: unknown) {
      console.error("Error al leer el archivo:", error)
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(`Error al leer el archivo: ${msg}`)
      setValidationErrors([`Error al parsear JSON: ${msg}`])
    } finally {
      setIsValidating(false)
    }
  }

  /** Limpia proyectos, nombre de archivo, errores de validación y el input de archivo */
  const handleClearFile = () => {
    setProjects([])
    setFileName("")
    setValidationErrors([])
    setUploaded(0)
    setTotal(0)
    setErrors([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  /** Sube cada proyecto del state a Firestore (planAnualCompras) y actualiza progreso y errores */
  const handleUpload = async () => {
    if (projects.length === 0) {
      toast.error("No hay proyectos para subir. Por favor, recargue la página.")
      return
    }

    if (!confirm("¿Está seguro de que desea subir todos los proyectos? Esto agregará los datos a Firebase.")) {
      return
    }

    setIsUploading(true)
    setUploaded(0)
    setErrors([])
    setTotal(projects.length)

    try {
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i]
        try {
          await addDoc(collection(db, "planAnualCompras"), {
            projectName: project.projectName || "",
            goodOrServiceName: project.goodOrServiceName || "",
            department: project.department || "",
            purchaseType: project.purchaseType || "",
            preparationMonth: project.preparationMonth || "",
            publicationMonth: project.publicationMonth || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          setUploaded(i + 1)
        } catch (error: unknown) {
          console.error(`Error al subir proyecto ${i + 1}:`, error)
          const msg = error instanceof Error ? error.message : String(error)
          setErrors((prev) => [...prev, `Proyecto ${i + 1}: ${msg}`])
        }
      }

      toast.success(`Se subieron ${uploaded} de ${total} proyectos correctamente`)
      if (errors.length > 0) {
        toast.warning(`Hubo ${errors.length} errores durante la carga`)
      }
    } catch (error: unknown) {
      console.error("Error general:", error)
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(`Error al subir los proyectos: ${msg}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-6 w-6" />
            Importar Plan Anual de Compras
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Instrucciones */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              <strong>Instrucciones:</strong>
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-200 list-disc list-inside space-y-1">
              <li>Seleccione un archivo JSON con la estructura del plan anual de compras</li>
              <li>El archivo debe contener un array de objetos con los campos: projectName, goodOrServiceName, department, purchaseType, preparationMonth, publicationMonth</li>
              <li>Los datos se validarán antes de subir a Firebase</li>
            </ul>
          </div>

          {/* Selector de archivo */}
          <div className="space-y-2">
            <Label htmlFor="json-file" className="text-base font-semibold">
              Seleccionar archivo JSON
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="json-file"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="cursor-pointer"
                  disabled={isUploading || isValidating}
                />
              </div>
              {fileName && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClearFile}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {fileName && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
              </div>
            )}
          </div>

          {/* Validación */}
          {isValidating && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Validando archivo...</span>
            </div>
          )}

          {/* Errores de validación */}
          {validationErrors.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Errores de validación ({validationErrors.length})
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {validationErrors.slice(0, 10).map((error, index) => (
                  <p key={index} className="text-xs text-yellow-700 dark:text-yellow-300">
                    {error}
                  </p>
                ))}
                {validationErrors.length > 10 && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 italic">
                    ... y {validationErrors.length - 10} errores más
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Información del archivo */}
          {projects.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    Archivo válido
                  </span>
                </div>
                <span className="text-sm font-bold text-green-800 dark:text-green-200">
                  {projects.length} proyectos
                </span>
              </div>
            </div>
          )}

          {/* Progreso de carga */}
          <div className="space-y-4">

            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progreso:</span>
                  <span className="font-semibold">
                    {uploaded} / {total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div
                    className="bg-[#1a2da6] h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${total > 0 ? (uploaded / total) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-800 dark:text-red-200">
                    Errores ({errors.length})
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {errors.map((error, index) => (
                    <p key={index} className="text-xs text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {!isUploading && uploaded === total && total > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    Carga completada exitosamente
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Botón de subida */}
          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={isUploading || projects.length === 0 || isValidating}
              className="flex-1 bg-[#1a2da6] hover:bg-[#152389] text-white"
              size="lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Subiendo proyectos...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Subir a Firebase
                </>
              )}
            </Button>
            {projects.length > 0 && !isUploading && (
              <Button
                onClick={handleClearFile}
                variant="outline"
                size="lg"
              >
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
