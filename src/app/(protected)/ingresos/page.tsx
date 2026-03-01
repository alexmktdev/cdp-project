"use client"

/**
 * Ingresos de compras: formulario para registrar una orden de compra (OC).
 * Guarda en Firestore colección "oc" (fecha, número, tipo, proveedor, RUT, monto, categoría si es Ayuda Social).
 */
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Save, FileText, DollarSign, User, Tag, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn, getDisplayName } from "@/lib/utils"
import { toast } from "sonner"
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, addDoc, Timestamp } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"

export default function IngresosComprasPage() {
  const { user } = useAuth()
  const [date, setDate] = useState<Date>()
  const [numeroOC, setNumeroOC] = useState("")
  const [nombreOC, setNombreOC] = useState("")
  const [tipoOC, setTipoOC] = useState("")
  const [nombreProveedor, setNombreProveedor] = useState("")
  const [rutProveedor, setRutProveedor] = useState("")
  const [monto, setMonto] = useState("")
  const [montoDisplay, setMontoDisplay] = useState("")
  const [tipo, setTipo] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  /** Formatea valor numérico con separador de miles (es-CL) */
  const formatNumber = (value: string): string => {
    // Remover todo excepto números
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    
    // Formatear con separador de miles (punto)
    return Number(numbers).toLocaleString("es-CL")
  }

  /** Actualiza monto (solo números) y montoDisplay (formato es-CL) */
  const handleMontoChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setMonto(cleanValue)
    setMontoDisplay(formatNumber(value))
  }

  /** Formatea RUT chileno con puntos y guión (ej. 12.345.678-9) */
  const formatRut = (value: string): string => {
    // Remover todo excepto números y k/K
    const cleanValue = value.replace(/[^0-9kK]/g, "")
    
    if (cleanValue.length === 0) return ""
    
    // Separar el dígito verificador
    const dv = cleanValue.slice(-1).toUpperCase()
    const numbers = cleanValue.slice(0, -1)
    
    if (numbers.length === 0) return dv
    
    // Formatear con puntos
    const formattedNumbers = numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    
    return `${formattedNumbers}-${dv}`
  }

  /** Aplica formato RUT (puntos y guión) al escribir */
  const handleRutChange = (value: string) => {
    const formatted = formatRut(value)
    setRutProveedor(formatted)
  }

  useEffect(() => {
    if (tipoOC !== "AS") {
      setTipo("")
    }
  }, [tipoOC])

  /** Valida campos, guarda OC en Firestore y resetea formulario */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!date || !numeroOC || !nombreOC || !tipoOC || !nombreProveedor || !rutProveedor || !monto) {
      toast.error("Por favor complete todos los campos obligatorios")
      return
    }

    // Si es Ayuda Social, validar que tenga categoría
    if (tipoOC === "AS" && !tipo) {
      toast.error("Debe seleccionar una categoría para Ayuda Social")
      return
    }

    setIsLoading(true)

    try {
      // Preparar los datos para guardar en Firebase
      const ocData = {
        fechaOC: Timestamp.fromDate(date),
        numeroOC: numeroOC,
        nombreOC: nombreOC,
        tipoOC: tipoOC,
        nombreProveedor: nombreProveedor,
        rutProveedor: rutProveedor,
        monto: Number(monto),
        categoria: tipoOC === "AS" ? tipo : null,
        estado: "pendiente",
        creadoPor: getDisplayName(user),
        creadoPorUid: user?.uid || null,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      }

      // Guardar en la colección "oc" de Firebase
      const docRef = await addDoc(collection(db, "oc"), ocData)

      console.log("Orden de compra guardada con ID:", docRef.id)
      
      toast.success("Orden de compra registrada correctamente")
      
      // Limpiar el formulario
      handleReset()
    } catch (error) {
      console.error("Error al guardar la orden de compra:", error)
      toast.error("Error al guardar la orden de compra. Intente nuevamente.")
    } finally {
      setIsLoading(false)
    }
  }

  /** Limpia todos los campos del formulario de OC */
  const handleReset = () => {
    setDate(undefined)
    setNumeroOC("")
    setNombreOC("")
    setTipoOC("")
    setNombreProveedor("")
    setRutProveedor("")
    setMonto("")
    setMontoDisplay("")
    setTipo("")
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header con estadísticas */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-[#1a2da6]" />
              Registro de Orden de Compra
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Complete el formulario para registrar una nueva OC
            </p>
          </div>
        </div>

        {/* Formulario Principal */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información de la OC */}
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1a2da6]" />
                Datos de la Orden de Compra
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Fecha OC */}
                  <div className="space-y-2">
                    <Label htmlFor="fecha" className="flex items-center gap-1.5 text-sm font-medium">
                      <CalendarIcon className="h-4 w-4 text-[#1a2da6]" />
                      Fecha OC
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* N° OC */}
                  <div className="space-y-2">
                    <Label htmlFor="numeroOC" className="flex items-center gap-1.5 text-sm font-medium">
                      <Tag className="h-4 w-4 text-[#1a2da6]" />
                      N° OC
                    </Label>
                    <Input
                      id="numeroOC"
                      placeholder="Ej: OC-2024-001"
                      value={numeroOC}
                      onChange={(e) => setNumeroOC(e.target.value.toUpperCase())}
                      required
                      className="uppercase"
                    />
                  </div>

                  {/* Tipo de OC */}
                  <div className="space-y-2 w-full">
                    <Label htmlFor="tipoOC" className="flex items-center gap-1.5 text-sm font-medium">
                      <FileText className="h-4 w-4 text-[#1a2da6]" />
                      Tipo de OC
                    </Label>
                    <Select value={tipoOC} onValueChange={setTipoOC}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AS">Ayuda Social</SelectItem>
                        <SelectItem value="CA">Compra Agil</SelectItem>
                        <SelectItem value="TD">Trato Directo</SelectItem>
                        <SelectItem value="CM">Convenio Marco</SelectItem>
                        <SelectItem value="ES">Excluida del Sistema</SelectItem>
                        <SelectItem value="LI">Licitación</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Nombre de la Orden de Compra */}
                <div className="space-y-2">
                  <Label htmlFor="nombreOC" className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#1a2da6]" />
                    Nombre de la Orden de Compra
                  </Label>
                  <Input
                    id="nombreOC"
                    placeholder="Ej: Compra de equipamiento médico"
                    value={nombreOC}
                    onChange={(e) => setNombreOC(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información del Proveedor y Compra */}
          <Card className="border-l-4 border-l-[#adca1f]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-[#adca1f]" />
                Datos del Proveedor y Compra
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                {/* Nombre Proveedor */}
                <div className="space-y-2">
                  <Label htmlFor="proveedor" className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="h-4 w-4 text-[#adca1f]" />
                    Nombre del Proveedor
                  </Label>
                  <Input
                    id="proveedor"
                    placeholder="Ingrese el nombre del proveedor"
                    value={nombreProveedor}
                    onChange={(e) => setNombreProveedor(e.target.value)}
                    required
                  />
                </div>

                {/* RUT Proveedor */}
                <div className="space-y-2 mb-2">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Monto */}
                <div className="space-y-2">
                  <Label htmlFor="monto" className="flex items-center gap-1.5 text-sm font-medium">
                    <DollarSign className="h-4 w-4 text-[#adca1f]" />
                    Monto
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">$</span>
                    <Input
                      id="monto"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={montoDisplay}
                      onChange={(e) => handleMontoChange(e.target.value)}
                      className="pl-8"
                      required
                    />
                  </div>
                </div>

                {/* Categoría - Solo visible cuando es Ayuda Social */}
                {tipoOC === "AS" && (
                  <div className="space-y-2">
                    <Label htmlFor="tipo" className="flex items-center gap-1.5 text-sm font-medium">
                      <Tag className="h-4 w-4 text-[#adca1f]" />
                      Categoría
                    </Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="examenes">Exámenes</SelectItem>
                        <SelectItem value="medicamentos">Medicamentos</SelectItem>
                        <SelectItem value="otros">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                  Guardar Orden de Compra
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

