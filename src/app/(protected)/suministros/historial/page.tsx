"use client"

/**
 * Historial de suministros: listado con facturas, agregar factura, editar número/fecha de factura,
 * editar suministro completo y eliminar. Usuarios autorizados (sa, admin, municipal) pueden editar y eliminar.
 */
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { History, Package, Loader2, Plus, CalendarIcon, Receipt, Edit2, Check, X, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, query, getDocs, orderBy, doc, updateDoc, deleteDoc, Timestamp, arrayUnion } from "firebase/firestore"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn, toDateSafe } from "@/lib/utils"

/** Factura asociada a un suministro (almacenada en el array facturas del documento) */
interface Factura {
  fecha: Timestamp
  fechaFactura?: Timestamp
  numeroOC: string
  monto: number
  numeroSolicitudPedido: string
  numeroFactura: string
  fechaRegistro: Timestamp
}

/** Documento suministro en Firestore con array de facturas */
interface Suministro {
  id: string
  idLicitacion: string
  nombre: string
  presupuesto: number
  presupuestoRestante?: number
  unidadTecnica: string
  proveedor: string
  rutProveedor: string
  estado: string
  facturas?: Factura[]
  creadoPor: string
  creadoEn: Timestamp
}

export default function HistorialSuministrosPage() {
  const [suministros, setSuministros] = useState<Suministro[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedSuministro, setSelectedSuministro] = useState<Suministro | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showFacturas, setShowFacturas] = useState<string | null>(null)
  const [editingFacturaIndex, setEditingFacturaIndex] = useState<number | null>(null)
  const [tempNumeroFactura, setTempNumeroFactura] = useState("")
  const [tempFechaFactura, setTempFechaFactura] = useState<Date | undefined>()

  const [fecha, setFecha] = useState<Date>()
  const [numeroOC, setNumeroOC] = useState("")
  const [monto, setMonto] = useState("")
  const [montoDisplay, setMontoDisplay] = useState("")
  const [numeroSolicitudPedido, setNumeroSolicitudPedido] = useState("")
  const [numeroFactura, setNumeroFactura] = useState("")

  const [suministroToDelete, setSuministroToDelete] = useState<Suministro | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [suministroToEdit, setSuministroToEdit] = useState<Suministro | null>(null)
  const [isEditSuministroOpen, setIsEditSuministroOpen] = useState(false)
  const [editIdLicitacion, setEditIdLicitacion] = useState("")
  const [editNombre, setEditNombre] = useState("")
  const [editPresupuesto, setEditPresupuesto] = useState("")
  const [editPresupuestoDisplay, setEditPresupuestoDisplay] = useState("")
  const [editUnidadTecnica, setEditUnidadTecnica] = useState("")
  const [editProveedor, setEditProveedor] = useState("")
  const [editRutProveedor, setEditRutProveedor] = useState("")
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollArrows = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  useEffect(() => {
    const el = tableScrollRef.current
    const run = () => {
      requestAnimationFrame(updateScrollArrows)
    }
    run()
    const t = setTimeout(run, 100)
    if (!el) return () => clearTimeout(t)
    el.addEventListener("scroll", updateScrollArrows)
    const ro = new ResizeObserver(run)
    ro.observe(el)
    return () => {
      clearTimeout(t)
      el.removeEventListener("scroll", updateScrollArrows)
      ro.disconnect()
    }
  }, [updateScrollArrows, suministros.length])

  const scrollTable = (direction: "left" | "right") => {
    const el = tableScrollRef.current
    if (!el) return
    const step = 280
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" })
    setTimeout(updateScrollArrows, 350)
  }

  /** Carga suministros desde Firestore; si falla orderBy, ordena en memoria por creadoEn. getCancelled: opcional, si devuelve true no se hace setState. */
  const loadSuministros = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    try {
      setIsLoading(true)
      const suministrosRef = collection(db, "suministros")
      let querySnapshot
      try {
        const q = query(suministrosRef, orderBy("creadoEn", "desc"))
        querySnapshot = await getDocs(q)
      } catch {
        querySnapshot = await getDocs(suministrosRef)
      }
      if (getCancelled()) return
      const suministrosData: Suministro[] = []
      querySnapshot.forEach((doc) => {
        suministrosData.push({
          id: doc.id,
          ...doc.data(),
        } as Suministro)
      })
      suministrosData.sort((a, b) => {
        const tA = toDateSafe(a.creadoEn)?.getTime() ?? 0
        const tB = toDateSafe(b.creadoEn)?.getTime() ?? 0
        return tB - tA
      })
      if (!getCancelled()) setSuministros(suministrosData)
    } catch (error) {
      if (!getCancelled()) {
        console.error("Error al cargar suministros:", error)
        toast.error("Error al cargar el historial de suministros")
      }
    } finally {
      if (!getCancelled()) setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadSuministros({ getCancelled: () => cancelled })
    return () => { cancelled = true }
  }, [])

  const formatMonto = (monto: number) => monto.toLocaleString("es-CL")

  const formatNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    return Number(numbers).toLocaleString("es-CL")
  }

  const handleMontoChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setMonto(cleanValue)
    setMontoDisplay(formatNumber(value))
  }

  /** Valida presupuesto restante y abre el diálogo para agregar una factura al suministro */
  const handleAgregarFactura = (suministro: Suministro) => {
    const presupuestoRestante = suministro.presupuestoRestante ?? suministro.presupuesto
    
    // Validar que haya presupuesto disponible
    if (presupuestoRestante <= 0) {
      toast.error("No se pueden agregar más facturas", {
        description: "El presupuesto de este suministro está agotado"
      })
      return
    }
    
    setSelectedSuministro(suministro)
    // Limpiar campos
    setFecha(undefined)
    setNumeroOC("")
    setMonto("")
    setMontoDisplay("")
    setNumeroSolicitudPedido("")
    setNumeroFactura("")
    setIsDialogOpen(true)
  }

  /** Crea la factura/OC en el array del suministro, actualiza presupuestoRestante en Firestore y cierra el diálogo */
  const handleGuardarFactura = async () => {
    if (!selectedSuministro) return

    if (!fecha || !numeroOC.trim() || !monto || !numeroSolicitudPedido.trim()) {
      toast.error("Por favor complete todos los campos")
      return
    }

    const montoNumerico = Number(monto)
    const presupuestoRestante = selectedSuministro.presupuestoRestante ?? selectedSuministro.presupuesto

    // Validar que no exceda el presupuesto restante
    if (montoNumerico > presupuestoRestante) {
      toast.error(`El monto excede el presupuesto restante ($${formatMonto(presupuestoRestante)})`)
      return
    }

    setIsSaving(true)

    try {
      const suministroRef = doc(db, "suministros", selectedSuministro.id)
      
      // Crear el objeto de OC
      const nuevaFactura: Factura = {
        fecha: Timestamp.fromDate(fecha),
        numeroOC: numeroOC.toUpperCase(),
        monto: montoNumerico,
        numeroSolicitudPedido: numeroSolicitudPedido.toUpperCase(),
        numeroFactura: "", // Se agregará después en el modal de detalles
        fechaRegistro: Timestamp.now(),
      }

      // Calcular nuevo presupuesto restante
      const nuevoPresupuestoRestante = presupuestoRestante - montoNumerico

      // Determinar si el suministro está completado (presupuesto agotado o casi agotado)
      const estadoActualizado = nuevoPresupuestoRestante <= 0 ? "completado" : "en_proceso"

      // Actualizar en Firebase
      await updateDoc(suministroRef, {
        facturas: arrayUnion(nuevaFactura),
        presupuestoRestante: nuevoPresupuestoRestante < 0 ? 0 : nuevoPresupuestoRestante,
        estado: estadoActualizado,
        actualizadoEn: serverTimestamp(),
      })

      // Mensaje de éxito según el estado
      if (estadoActualizado === "completado") {
        toast.success("✅ OC registrada - Presupuesto completado", {
          description: "El suministro ha sido marcado como completado"
        })
      } else {
        toast.success("Orden de Compra registrada correctamente")
      }
      setIsDialogOpen(false)
      
      // Limpiar campos
      setFecha(undefined)
      setNumeroOC("")
      setMonto("")
      setMontoDisplay("")
      setNumeroSolicitudPedido("")
      setNumeroFactura("")
      setSelectedSuministro(null)

      // Recargar suministros
      loadSuministros()
    } catch (error) {
      console.error("Error al guardar la factura:", error)
      toast.error("Error al guardar la factura")
    } finally {
      setIsSaving(false)
    }
  }

  /** Actualiza numeroFactura y fechaFactura de una factura en el array del suministro y guarda en Firestore */
  const handleGuardarNumeroFactura = async (suministroId: string, facturaIndex: number) => {
    if (!tempNumeroFactura.trim()) {
      toast.error("El número de factura no puede estar vacío")
      return
    }

    setIsSaving(true)

    try {
      const suministro = suministros.find(s => s.id === suministroId)
      if (!suministro || !suministro.facturas) return

      // Crear una copia del array de facturas y actualizar la factura específica
      const facturasActualizadas = [...suministro.facturas]
      facturasActualizadas[facturaIndex] = {
        ...facturasActualizadas[facturaIndex],
        numeroFactura: tempNumeroFactura.toUpperCase(),
        fechaFactura: tempFechaFactura ? Timestamp.fromDate(tempFechaFactura) : undefined
      }

      // Actualizar en Firebase
      const suministroRef = doc(db, "suministros", suministroId)
      await updateDoc(suministroRef, {
        facturas: facturasActualizadas,
        actualizadoEn: serverTimestamp(),
      })

      toast.success("Datos de factura guardados correctamente")
      setEditingFacturaIndex(null)
      setTempNumeroFactura("")
      setTempFechaFactura(undefined)
      
      // Recargar suministros
      loadSuministros()
    } catch (error) {
      console.error("Error al guardar los datos de factura:", error)
      toast.error("Error al guardar los datos de factura")
    } finally {
      setIsSaving(false)
    }
  }

  /** Activa el modo edición para la factura en el índice dado y carga numero y fecha en estado temporal */
  const handleEditarNumeroFactura = (index: number, numeroActual: string, fechaActual?: Timestamp) => {
    setEditingFacturaIndex(index)
    setTempNumeroFactura(numeroActual)
    setTempFechaFactura(toDateSafe(fechaActual) ?? undefined)
  }

  /** Sale del modo edición y limpia los valores temporales de factura */
  const handleCancelarEdicion = () => {
    setEditingFacturaIndex(null)
    setTempNumeroFactura("")
    setTempFechaFactura(undefined)
  }

  /** Abre el diálogo de edición del suministro */
  const handleEditarSuministro = (suministro: Suministro) => {
    setSuministroToEdit(suministro)
    setEditIdLicitacion(suministro.idLicitacion ?? "")
    setEditNombre(suministro.nombre ?? "")
    setEditPresupuesto(String(suministro.presupuesto ?? 0))
    setEditPresupuestoDisplay(formatMonto(suministro.presupuesto ?? 0))
    setEditUnidadTecnica(suministro.unidadTecnica ?? "")
    setEditProveedor(suministro.proveedor ?? "")
    setEditRutProveedor(suministro.rutProveedor ?? "")
    setIsEditSuministroOpen(true)
  }

  /** Guarda la edición del suministro; ajusta presupuestoRestante si cambia el presupuesto total */
  const handleGuardarEdicionSuministro = async () => {
    if (!suministroToEdit) return
    if (!editIdLicitacion.trim() || !editNombre.trim() || !editPresupuesto || !editUnidadTecnica.trim() || !editProveedor.trim() || !editRutProveedor.trim()) {
      toast.error("Complete todos los campos obligatorios")
      return
    }
    const nuevoPresupuesto = Number(editPresupuesto) || 0
    if (nuevoPresupuesto < 0) {
      toast.error("El presupuesto no puede ser negativo")
      return
    }
    const presupuestoActual = suministroToEdit.presupuesto ?? 0
    const restanteActual = suministroToEdit.presupuestoRestante ?? suministroToEdit.presupuesto ?? 0
    const gastado = presupuestoActual - restanteActual
    const nuevoRestante = Math.max(0, nuevoPresupuesto - gastado)

    setIsSaving(true)
    try {
      const suministroRef = doc(db, "suministros", suministroToEdit.id)
      await updateDoc(suministroRef, {
        idLicitacion: editIdLicitacion.trim().toUpperCase(),
        nombre: editNombre.trim(),
        presupuesto: nuevoPresupuesto,
        presupuestoRestante: nuevoRestante,
        unidadTecnica: editUnidadTecnica.trim(),
        proveedor: editProveedor.trim(),
        rutProveedor: editRutProveedor.trim(),
        actualizadoEn: serverTimestamp(),
      })
      toast.success("Suministro actualizado")
      setIsEditSuministroOpen(false)
      setSuministroToEdit(null)
      loadSuministros()
    } catch (error) {
      console.error("Error al actualizar suministro:", error)
      toast.error("Error al actualizar el suministro")
    } finally {
      setIsSaving(false)
    }
  }

  /** Abre el diálogo de confirmación para eliminar el suministro */
  const handleEliminarSuministro = (suministro: Suministro) => setSuministroToDelete(suministro)

  /** Elimina el suministro en Firestore tras confirmar */
  const handleConfirmarEliminarSuministro = async () => {
    if (!suministroToDelete) return
    setIsDeleting(true)
    try {
      await deleteDoc(doc(db, "suministros", suministroToDelete.id))
      toast.success("Suministro eliminado")
      setSuministroToDelete(null)
      loadSuministros()
    } catch (error) {
      console.error("Error al eliminar suministro:", error)
      toast.error("Error al eliminar el suministro")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="py-6 px-2 md:px-4">
      <div className="w-full max-w-none space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <History className="h-7 w-7 text-[#1a2da6]" />
              Historial de Suministros
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Listado de todos los suministros registrados
            </p>
          </div>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
          </div>
        ) : suministros.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No hay suministros registrados</p>
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            {canScrollLeft && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10 rounded-lg self-center border-2"
                onClick={() => scrollTable("left")}
                title="Deslizar a la izquierda"
                aria-label="Deslizar tabla a la izquierda"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
              <div ref={tableScrollRef} className="overflow-x-auto overflow-y-visible scroll-smooth">
                <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32 min-w-[120px]">
                      ID Licitación
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[220px]">
                      Unidad Técnica
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[180px]">
                      Proveedor
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Presupuesto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Restante
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {suministros.map((suministro) => {
                    const presupuestoRestante = suministro.presupuestoRestante ?? suministro.presupuesto
                    const porcentajeUsado = ((suministro.presupuesto - presupuestoRestante) / suministro.presupuesto) * 100
                    
                    return (
                      <tr key={suministro.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap w-32">
                          <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                            {suministro.idLicitacion}
                          </span>
                        </td>
                        <td className="px-4 py-4 min-w-[200px] align-top">
                          <div className="text-sm font-medium text-gray-900 dark:text-white break-words" title={suministro.nombre}>
                            {suministro.nombre}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {suministro.facturas?.length || 0} OC
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[220px] align-top">
                          <div className="text-sm text-gray-900 dark:text-white break-words" title={suministro.unidadTecnica}>
                            {suministro.unidadTecnica}
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[180px] align-top">
                          <div className="text-sm text-gray-900 dark:text-white break-words">
                            {suministro.proveedor}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {suministro.rutProveedor}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            $ {formatMonto(suministro.presupuesto)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {porcentajeUsado.toFixed(1)}% usado
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className={`text-sm font-bold ${presupuestoRestante <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            $ {formatMonto(presupuestoRestante)}
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2 min-w-[80px]">
                            <div
                              className={`h-full rounded-full transition-all ${
                                porcentajeUsado >= 100
                                  ? "bg-red-600"
                                  : porcentajeUsado >= 75
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(porcentajeUsado, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                              suministro.estado === "completado"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : suministro.estado === "en_proceso"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            }`}
                          >
                            {suministro.estado === "en_proceso" ? "En Proceso" : suministro.estado}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditarSuministro(suministro)}
                              className="h-8 text-xs hover:bg-[#1a2da6] hover:text-white"
                              title="Editar suministro"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </Button>
                            {suministro.facturas && suministro.facturas.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowFacturas(showFacturas === suministro.id ? null : suministro.id)}
                                className="h-8 text-xs"
                              >
                                <Receipt className="h-3.5 w-3.5 mr-1" />
                                Ver
                              </Button>
                            )}
                            {presupuestoRestante <= 0 ? (
                              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                                Agotado
                              </span>
                            ) : (
                              <Button
                                onClick={() => handleAgregarFactura(suministro)}
                                size="sm"
                                className="bg-[#1a2da6] hover:bg-[#1a2da6]/90 h-8 text-xs"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                OC
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEliminarSuministro(suministro)}
                              className="h-8 text-xs hover:bg-red-600 hover:text-white text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
                              title="Eliminar suministro"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
            {canScrollRight && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10 rounded-lg self-center border-2"
                onClick={() => scrollTable("right")}
                title="Deslizar a la derecha"
                aria-label="Deslizar tabla a la derecha"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Dialog para agregar OC */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar Orden de Compra</DialogTitle>
            <DialogDescription>
              Licitación: <strong>{selectedSuministro?.idLicitacion}</strong> | 
              Presupuesto Restante: <strong className="text-green-600">
                ${formatMonto(selectedSuministro?.presupuestoRestante ?? selectedSuministro?.presupuesto ?? 0)}
              </strong>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Fecha */}
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fecha && "text-muted-foreground"
                    )}
                    disabled={isSaving}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fecha ? format(fecha, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={setFecha}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* N° Orden de Compra */}
            <div className="space-y-2">
              <Label htmlFor="numeroOC">N° Orden de Compra *</Label>
              <Input
                id="numeroOC"
                placeholder="Ej: OC-2024-001"
                value={numeroOC}
                onChange={(e) => setNumeroOC(e.target.value.toUpperCase())}
                className="uppercase"
                disabled={isSaving}
              />
            </div>

            {/* Monto */}
            <div className="space-y-2">
              <Label htmlFor="monto">Monto *</Label>
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
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* N° Solicitud de Pedido */}
            <div className="space-y-2">
              <Label htmlFor="numeroSolicitud">N° Solicitud de Pedido *</Label>
              <Input
                id="numeroSolicitud"
                placeholder="Ej: SP-2024-001"
                value={numeroSolicitudPedido}
                onChange={(e) => setNumeroSolicitudPedido(e.target.value.toUpperCase())}
                className="uppercase"
                disabled={isSaving}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardarFactura}
              disabled={isSaving}
              className="bg-[#1a2da6] hover:bg-[#1a2da6]/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar OC"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para ver detalles de OCs */}
      {showFacturas && (
        <Dialog open={!!showFacturas} onOpenChange={() => { setShowFacturas(null); handleCancelarEdicion(); }}>
          <DialogContent className="max-w-[95vw] md:max-w-6xl max-h-[95vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="text-2xl font-bold">Historial de Órdenes de Compra</DialogTitle>
              <DialogDescription asChild>
                <div className="text-muted-foreground text-base mt-2 flex flex-col gap-1">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Licitación: </span>
                    <strong className="text-blue-600 text-lg">
                      {suministros.find(s => s.id === showFacturas)?.idLicitacion}
                    </strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Nombre: </span>
                    <strong className="text-gray-900 dark:text-white">
                      {suministros.find(s => s.id === showFacturas)?.nombre}
                    </strong>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="rounded-lg border shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800">
                      <TableHead className="text-base font-semibold whitespace-nowrap py-4">Fecha OC</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap py-4">N° Orden de Compra</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap py-4">N° Solicitud de Pedido</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap py-4">N° Factura</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap py-4">Fecha Factura</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap text-right py-4">Monto</TableHead>
                      <TableHead className="text-base font-semibold whitespace-nowrap text-center py-4">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suministros.find(s => s.id === showFacturas)?.facturas?.map((factura, index) => (
                      <TableRow key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <TableCell className="whitespace-nowrap text-base py-4">
                          {toDateSafe(factura.fecha) ? format(toDateSafe(factura.fecha)!, "dd 'de' MMMM 'de' yyyy", { locale: es }) : "-"}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap text-base py-4">{factura.numeroOC}</TableCell>
                        <TableCell className="whitespace-nowrap text-base py-4">{factura.numeroSolicitudPedido}</TableCell>
                        <TableCell className="py-4">
                          {editingFacturaIndex === index ? (
                            <div className="flex flex-col gap-2">
                              <Input
                                value={tempNumeroFactura}
                                onChange={(e) => setTempNumeroFactura(e.target.value.toUpperCase())}
                                className="uppercase h-8 text-sm"
                                placeholder="Ej: FACT-2024-001"
                                disabled={isSaving}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {factura.numeroFactura ? (
                                <span className="font-semibold text-green-600 text-base">{factura.numeroFactura}</span>
                              ) : (
                                <span className="text-gray-400 italic text-sm">Sin factura</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {editingFacturaIndex === index ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "h-8 w-full justify-start text-left font-normal text-sm",
                                    !tempFechaFactura && "text-muted-foreground"
                                  )}
                                  disabled={isSaving}
                                >
                                  <CalendarIcon className="mr-2 h-3 w-3" />
                                  {tempFechaFactura ? format(tempFechaFactura, "dd/MM/yyyy", { locale: es }) : "Fecha opcional"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={tempFechaFactura}
                                  onSelect={setTempFechaFactura}
                                  locale={es}
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div>
                              {toDateSafe(factura.fechaFactura) ? (
                                <span className="text-blue-600 dark:text-blue-400 font-medium text-base">
                                  {format(toDateSafe(factura.fechaFactura)!, "dd/MM/yyyy", { locale: es })}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-sm">Sin fecha</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-right whitespace-nowrap text-base py-4">$ {formatMonto(factura.monto)}</TableCell>
                        <TableCell className="text-center py-4">
                          {editingFacturaIndex === index ? (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleGuardarNumeroFactura(showFacturas!, index)}
                                disabled={isSaving}
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelarEdicion}
                                disabled={isSaving}
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditarNumeroFactura(index, factura.numeroFactura, factura.fechaFactura)}
                              disabled={isSaving || editingFacturaIndex !== null}
                              className="h-8"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              {factura.numeroFactura ? "Editar" : "Agregar"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Fila de Total Gastado */}
                    <TableRow className="bg-gray-100 dark:bg-gray-800 font-bold border-t-2">
                      <TableCell colSpan={6} className="text-right text-lg py-5">
                        Total Gastado:
                      </TableCell>
                      <TableCell className="text-right text-xl py-5">
                        $ {formatMonto(
                          suministros.find(s => s.id === showFacturas)?.facturas?.reduce((sum, f) => sum + f.monto, 0) || 0
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Fila de Presupuesto Restante */}
                    <TableRow className="bg-blue-50 dark:bg-blue-950 font-bold">
                      <TableCell colSpan={6} className="text-right text-lg py-5">
                        Presupuesto Restante:
                      </TableCell>
                      <TableCell className="text-right text-xl py-5">
                        <span className={
                          (suministros.find(s => s.id === showFacturas)?.presupuestoRestante ?? 0) <= 0 
                            ? "text-red-600" 
                            : "text-green-600"
                        }>
                          $ {formatMonto(
                            suministros.find(s => s.id === showFacturas)?.presupuestoRestante ?? 0
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t bg-gray-50 dark:bg-gray-900">
              <Button
                variant="outline"
                onClick={() => setShowFacturas(null)}
                className="w-full h-12 text-base font-medium"
              >
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog edición de suministro */}
      <Dialog open={isEditSuministroOpen} onOpenChange={setIsEditSuministroOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Suministro</DialogTitle>
            <DialogDescription>
              Modifique los datos del suministro. Si cambia el presupuesto total, el restante se ajustará según lo ya gastado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>ID Licitación *</Label>
              <Input value={editIdLicitacion} onChange={(e) => setEditIdLicitacion(e.target.value.toUpperCase())} className="uppercase" disabled={isSaving} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nombre *</Label>
              <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>Presupuesto *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <Input
                  value={editPresupuestoDisplay}
                  onChange={(e) => {
                    const v = e.target.value
                    setEditPresupuestoDisplay(formatNumber(v))
                    setEditPresupuesto(v.replace(/\D/g, ""))
                  }}
                  className="pl-8"
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unidad Técnica *</Label>
              <Input value={editUnidadTecnica} onChange={(e) => setEditUnidadTecnica(e.target.value)} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>Proveedor *</Label>
              <Input value={editProveedor} onChange={(e) => setEditProveedor(e.target.value)} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>RUT Proveedor *</Label>
              <Input value={editRutProveedor} onChange={(e) => setEditRutProveedor(e.target.value)} disabled={isSaving} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditSuministroOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleGuardarEdicionSuministro} disabled={isSaving} className="bg-[#1a2da6] hover:bg-[#1a2da6]/90">
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminar suministro */}
      <AlertDialog open={!!suministroToDelete} onOpenChange={(open) => !open && setSuministroToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este suministro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el suministro <strong>{suministroToDelete?.idLicitacion}</strong> ({suministroToDelete?.nombre}) y todas sus órdenes de compra asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarEliminarSuministro}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Eliminando...</> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

