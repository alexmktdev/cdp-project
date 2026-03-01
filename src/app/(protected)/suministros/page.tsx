"use client"

/**
 * Ingresos de suministros: formulario para registrar un suministro/licitación.
 * Guarda en Firestore colección "suministros" (id licitación, nombre, presupuesto, unidad técnica, proveedor, RUT).
 */
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Package, Save, DollarSign, User, Tag, Building2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"


/** Lista de unidades técnicas para el selector del formulario de suministros */
const unidadesTecnicas = [
  "Administración Municipal",
  "Administración Municipal/Direcciòn desarrollo economico local",
  "Alcaldia",
  "Departamento de Adquisiciones",
  "Departamento de Adquisiciones (adquisiciones)",
  "Departamento de Adquisiciones (bodega)",
  "Departamento de Adquisiciones (inventario)",
  "Departamento de Aseo y Ornato",
  "Departamento de Bienestar",
  "Departamento de contabilidad, finanzas y presupuesto",
  "Departamento de edificaciòn",
  "Departamento de Emergencia",
  "Departamento de fiscalizaciòn",
  "Departamento de Informatica",
  "Departamento de licencia de conducir",
  "Departamento de licencia de conducir/Departamento de permiso de circulaciòn",
  "Departamento de Movilizaciòn",
  "Departamento de personal y remuneraciones",
  "Departamento de personal y remuneraciones/Direcciòn de las personas",
  "Departamento de Programas",
  "Departamento de relaciones publicas y comunicaciones",
  "Departamento de rentas",
  "Departamento de Riesgos y Desastres",
  "Departamento de Servicios Generales",
  "Departamento de Tesoreria",
  "Departamento Social",
  "Dirección de Administración y Finanzas",
  "Dirección de Asesoria Juridica",
  "Dirección de Control",
  "Dirección de Desarrollo Comunitario",
  "Dirección de Desarrollo Economico Local",
  "Dirección de Innovacion y Desarrollo Tecnologico",
  "Dirección de Inspección",
  "Dirección de Obras Municipales",
  "Dirección de Operaciones",
  "Dirección de Operaciones/Direcciòn de Transito",
  "Dirección de Seguridad Pública",
  "Dirección de Transito y Transporte Público",
  "Dirección Medio Ambiente, Energia y Sustentabilidad",
  "Dirección Secretaria Comunal de Planificación",
  "Egis Vivienda Municipal",
  "Juzgado de Policia Local",
  "Oficina de Deporte",
  "Oficina de impuesto territorial",
  "Oficina de prevencion de riesgos",
  "Oficina de prevencion del delito y desarrollo",
  "Oficina Delegaciòn de Lontue",
  "Oficina Tenencia Responsable de Mascotas",
  "Organizaciones comunitarias",
  "Secciòn de coordinación y control de gestiòn",
  "Secciòn de inspecciòn de obras y proyectos",
  "Secretaria Municipal",
]

export default function IngresosSuministrosPage() {
  const { user } = useAuth()
  const [idLicitacion, setIdLicitacion] = useState("")
  const [nombre, setNombre] = useState("")
  const [presupuesto, setPresupuesto] = useState("")
  const [presupuestoDisplay, setPresupuestoDisplay] = useState("")
  const [unidadTecnica, setUnidadTecnica] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [rutProveedor, setRutProveedor] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  /** Formatea valor numérico con separador de miles (es-CL) para el campo presupuesto */
  const formatNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    return Number(numbers).toLocaleString("es-CL")
  }

  /** Actualiza valor interno y display formateado del presupuesto */
  const handlePresupuestoChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setPresupuesto(cleanValue)
    setPresupuestoDisplay(formatNumber(value))
  }

  /** Formatea RUT chileno con puntos y guión (ej. 12.345.678-9) */
  const formatRut = (value: string): string => {
    const cleanValue = value.replace(/[^0-9kK]/g, "")
    if (cleanValue.length === 0) return ""
    
    const dv = cleanValue.slice(-1).toUpperCase()
    const numbers = cleanValue.slice(0, -1)
    
    if (numbers.length === 0) return dv
    
    const formattedNumbers = numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    return `${formattedNumbers}-${dv}`
  }

  /** Aplica formato RUT (puntos y guión) al escribir */
  const handleRutChange = (value: string) => {
    const formatted = formatRut(value)
    setRutProveedor(formatted)
  }

  /** Valida campos, guarda suministro en Firestore y resetea formulario */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!idLicitacion || !nombre || !presupuesto || !unidadTecnica || !proveedor || !rutProveedor) {
      toast.error("Por favor complete todos los campos obligatorios")
      return
    }

    setIsLoading(true)

    try {
      // Preparar los datos para guardar en Firebase
      const presupuestoNumerico = Number(presupuesto)
      const suministroData = {
        idLicitacion: idLicitacion.toUpperCase(),
        nombre: nombre,
        presupuesto: presupuestoNumerico,
        presupuestoRestante: presupuestoNumerico,
        unidadTecnica: unidadTecnica,
        proveedor: proveedor,
        rutProveedor: rutProveedor,
        facturas: [],
        estado: "pendiente",
        creadoPor: user?.email || "Desconocido",
        creadoPorUid: user?.uid || null,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      }

      // Guardar en la colección "suministros" de Firebase
      const docRef = await addDoc(collection(db, "suministros"), suministroData)

      console.log("Suministro guardado con ID:", docRef.id)
      
      toast.success("Suministro registrado correctamente")
      
      // Limpiar el formulario
      handleReset()
    } catch (error) {
      console.error("Error al guardar el suministro:", error)
      toast.error("Error al guardar el suministro. Intente nuevamente.")
    } finally {
      setIsLoading(false)
    }
  }

  /** Limpia todos los campos del formulario de suministro */
  const handleReset = () => {
    setIdLicitacion("")
    setNombre("")
    setPresupuesto("")
    setPresupuestoDisplay("")
    setUnidadTecnica("")
    setProveedor("")
    setRutProveedor("")
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="h-7 w-7 text-[#1a2da6]" />
              Registro de Suministros
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Complete el formulario para registrar un nuevo suministro
            </p>
          </div>
        </div>

        {/* Formulario Principal */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información del Suministro */}
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Package className="h-5 w-5 text-[#1a2da6]" />
                Datos del Suministro
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ID Licitación */}
                <div className="space-y-2">
                  <Label htmlFor="idLicitacion" className="flex items-center gap-1.5 text-sm font-medium">
                    <Tag className="h-4 w-4 text-[#1a2da6]" />
                    ID Licitación
                  </Label>
                  <Input
                    id="idLicitacion"
                    placeholder="Ej: LIC-2024-001"
                    value={idLicitacion}
                    onChange={(e) => setIdLicitacion(e.target.value.toUpperCase())}
                    className="uppercase"
                    required
                  />
                </div>

                {/* Presupuesto Otorgado */}
                <div className="space-y-2">
                  <Label htmlFor="presupuesto" className="flex items-center gap-1.5 text-sm font-medium">
                    <DollarSign className="h-4 w-4 text-[#1a2da6]" />
                    Presupuesto Otorgado
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">$</span>
                    <Input
                      id="presupuesto"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={presupuestoDisplay}
                      onChange={(e) => handlePresupuestoChange(e.target.value)}
                      className="pl-8"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Nombre */}
                <div className="space-y-2">
                  <Label htmlFor="nombre" className="flex items-center gap-1.5 text-sm font-medium">
                    <Package className="h-4 w-4 text-[#1a2da6]" />
                    Nombre del Suministro
                  </Label>
                  <Input
                    id="nombre"
                    placeholder="Ingrese el nombre del suministro"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </div>

                {/* Unidad Técnica */}
                <div className="space-y-2">
                  <Label htmlFor="unidadTecnica" className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-[#1a2da6]" />
                    Unidad Técnica
                  </Label>
                  <Select value={unidadTecnica} onValueChange={setUnidadTecnica}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar unidad técnica" />  
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesTecnicas.map((unidad) => (
                        <SelectItem key={unidad} value={unidad}>
                          {unidad}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información del Proveedor */}
          <Card className="border-l-4 border-l-[#adca1f]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-[#adca1f]" />
                Datos del Proveedor
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre Proveedor */}
                <div className="space-y-2">
                  <Label htmlFor="proveedor" className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="h-4 w-4 text-[#adca1f]" />
                    Nombre del Proveedor
                  </Label>
                  <Input
                    id="proveedor"
                    placeholder="Ingrese el nombre del proveedor"
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    required
                  />
                </div>

                {/* RUT Proveedor */}
                <div className="space-y-2">
                  <Label htmlFor="rutProveedor" className="flex items-center gap-1.5 text-sm font-medium">
                    <Tag className="h-4 w-4 text-[#adca1f]" />
                    RUT Proveedor
                  </Label>
                  <Input
                    id="rutProveedor"
                    placeholder="12.345.678-9"
                    value={rutProveedor}
                    onChange={(e) => handleRutChange(e.target.value)}
                    maxLength={12}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botones de Acción */}
          <div className="flex gap-3 justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              className="px-6"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="bg-[#1a2da6] hover:bg-[#1a2da6]/90 px-8"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar Suministro
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

