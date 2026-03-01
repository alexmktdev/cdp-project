"use client"

/**
 * Historial de órdenes de compra (OC): listado con paginación, detalle, edición de número de factura,
 * edición completa de la OC y eliminación. Usuarios autorizados (sa, admin, municipal) pueden editar y eliminar.
 */
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { History, FileText, Loader2, Plus, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Edit2, Trash2, CalendarIcon } from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, query, getDocs, orderBy, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn, toDateSafe } from "@/lib/utils"

/** Orden de compra desde Firestore */
interface OrdenCompra {
  id: string
  fechaOC: Timestamp
  numeroOC: string
  tipoOC: string
  nombreProveedor: string
  rutProveedor: string
  monto: number
  categoria?: string | null
  estado: string
  numeroFactura?: string
  creadoPor: string
  creadoEn: Timestamp
}



export default function HistorialComprasPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState<OrdenCompra | null>(null)
  const [numeroFactura, setNumeroFactura] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [ordenToDelete, setOrdenToDelete] = useState<OrdenCompra | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [ordenToEdit, setOrdenToEdit] = useState<OrdenCompra | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editFecha, setEditFecha] = useState<Date>()
  const [editNumeroOC, setEditNumeroOC] = useState("")
  const [editTipoOC, setEditTipoOC] = useState("")
  const [editNombreProveedor, setEditNombreProveedor] = useState("")
  const [editRutProveedor, setEditRutProveedor] = useState("")
  const [editMonto, setEditMonto] = useState("")
  const [editMontoDisplay, setEditMontoDisplay] = useState("")
  const [editCategoria, setEditCategoria] = useState("")
  const [editNumeroFactura, setEditNumeroFactura] = useState("")
  const [editEstado, setEditEstado] = useState("")

  /** Carga OC desde Firestore; si falla orderBy, carga sin orden y ordena en memoria por fecha. getCancelled: opcional, si devuelve true no se hace setState. */
  const loadOrdenes = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    try {
      setIsLoading(true)
      const ocRef = collection(db, "oc")
      let querySnapshot
      try {
        const q = query(ocRef, orderBy("creadoEn", "desc"))
        querySnapshot = await getDocs(q)
      } catch {
        querySnapshot = await getDocs(ocRef)
      }
      if (getCancelled()) return
      const ordenesData: OrdenCompra[] = []
      querySnapshot.forEach((doc) => {
        ordenesData.push({
          id: doc.id,
          ...doc.data(),
        } as OrdenCompra)
      })
      ordenesData.sort((a, b) => {
        const tA = toDateSafe(a.creadoEn)?.getTime() ?? toDateSafe(a.fechaOC)?.getTime() ?? 0
        const tB = toDateSafe(b.creadoEn)?.getTime() ?? toDateSafe(b.fechaOC)?.getTime() ?? 0
        return tB - tA
      })
      if (!getCancelled()) setOrdenes(ordenesData)
    } catch (error) {
      if (!getCancelled()) {
        console.error("Error al cargar órdenes:", error)
        toast.error("Error al cargar el historial de compras")
      }
    } finally {
      if (!getCancelled()) setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadOrdenes({ getCancelled: () => cancelled })
    return () => { cancelled = true }
  }, [])
  
  useEffect(() => {
    setCurrentPage(1)
  }, [ordenes.length])

  const formatMonto = (monto: number) => monto.toLocaleString("es-CL")

  const formatNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    return Number(numbers).toLocaleString("es-CL")
  }

  /** Abre el diálogo de edición completa con los datos de la orden */
  const handleEditarOrden = (orden: OrdenCompra) => {
    setOrdenToEdit(orden)
    setEditFecha(toDateSafe(orden.fechaOC) ?? undefined)
    setEditNumeroOC(orden.numeroOC ?? "")
    setEditTipoOC(orden.tipoOC ?? "")
    setEditNombreProveedor(orden.nombreProveedor ?? "")
    setEditRutProveedor(orden.rutProveedor ?? "")
    setEditMonto(String(orden.monto ?? 0))
    setEditMontoDisplay(formatMonto(orden.monto ?? 0))
    setEditCategoria(orden.categoria ?? "")
    setEditNumeroFactura(orden.numeroFactura ?? "")
    setEditEstado(orden.estado ?? "pendiente")
    setIsEditDialogOpen(true)
  }

  /** Guarda los cambios de la edición en Firestore */
  const handleGuardarEdicionOrden = async () => {
    if (!ordenToEdit) return
    if (!editNumeroOC.trim() || !editNombreProveedor.trim() || !editRutProveedor.trim()) {
      toast.error("Complete número OC, nombre y RUT del proveedor")
      return
    }
    const montoNum = Number(editMonto) || 0
    if (montoNum <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }
    setIsSaving(true)
    try {
      const ordenRef = doc(db, "oc", ordenToEdit.id)
      await updateDoc(ordenRef, {
        fechaOC: editFecha ? Timestamp.fromDate(editFecha) : ordenToEdit.fechaOC,
        numeroOC: editNumeroOC.trim().toUpperCase(),
        tipoOC: editTipoOC || ordenToEdit.tipoOC,
        nombreProveedor: editNombreProveedor.trim(),
        rutProveedor: editRutProveedor.trim(),
        monto: montoNum,
        categoria: editTipoOC === "AS" ? editCategoria.trim() || null : null,
        numeroFactura: editNumeroFactura.trim() || null,
        estado: editEstado || "pendiente",
        actualizadoEn: new Date(),
      })
      toast.success("Orden de compra actualizada")
      setIsEditDialogOpen(false)
      setOrdenToEdit(null)
      loadOrdenes()
    } catch (error) {
      console.error("Error al actualizar orden:", error)
      toast.error("Error al actualizar la orden")
    } finally {
      setIsSaving(false)
    }
  }

  /** Abre el diálogo de confirmación para eliminar */
  const handleEliminarOrden = (orden: OrdenCompra) => setOrdenToDelete(orden)

  /** Elimina la OC en Firestore tras confirmar */
  const handleConfirmarEliminarOrden = async () => {
    if (!ordenToDelete) return
    setIsDeleting(true)
    try {
      await deleteDoc(doc(db, "oc", ordenToDelete.id))
      toast.success("Orden de compra eliminada")
      setOrdenToDelete(null)
      loadOrdenes()
    } catch (error) {
      console.error("Error al eliminar orden:", error)
      toast.error("Error al eliminar la orden")
    } finally {
      setIsDeleting(false)
    }
  }

  /** Abre el diálogo para editar/agregar número de factura de la orden seleccionada */
  const handleAgregarFactura = (orden: OrdenCompra) => {
    setSelectedOrden(orden)
    setNumeroFactura(orden.numeroFactura || "")
    setIsDialogOpen(true)
  }

  /** Actualiza la OC en Firestore con numeroFactura y estado completado, luego recarga el listado */
  const handleGuardarFactura = async () => {
    if (!selectedOrden) return

    if (!numeroFactura.trim()) {
      toast.error("Ingrese un número de factura")
      return
    }

    setIsSaving(true)

    try {
      const ordenRef = doc(db, "oc", selectedOrden.id)
      await updateDoc(ordenRef, {
        numeroFactura: numeroFactura.toUpperCase(),
        estado: "completado",
        actualizadoEn: new Date(),
      })

      toast.success("Número de factura agregado y orden completada")
      setIsDialogOpen(false)
      setNumeroFactura("")
      setSelectedOrden(null)

      // Recargar órdenes
      loadOrdenes()
    } catch (error) {
      console.error("Error al guardar número de factura:", error)
      toast.error("Error al guardar el número de factura")
    } finally {
      setIsSaving(false)
    }
  }

  /** Devuelve la etiqueta legible del tipo de OC (AS → Ayuda Social, etc.) */
  const getTipoOCLabel = (tipo: string) => {
    const tipos: Record<string, string> = {
      AS: "Ayuda Social",
      CA: "Compra Ágil",
      TD: "Trato Directo",
      CM: "Convenio Marco",
      ES: "Excluida del Sistema",
      LI: "Licitación",
    }
    return tipos[tipo] || tipo
  }
  
  const totalPages = Math.ceil(ordenes.length / itemsPerPage)
  const indexOfLastItem = currentPage * itemsPerPage
  const indexOfFirstItem = indexOfLastItem - itemsPerPage
  const currentOrdenes = ordenes.slice(indexOfFirstItem, indexOfLastItem)

  const goToFirstPage = () => setCurrentPage(1)
  const goToLastPage = () => setCurrentPage(totalPages)
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1))
  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages))
  const goToPage = (page: number) => setCurrentPage(page)

  /** Genera el array de números de página a mostrar en la paginación (con elipsis si hay muchas) */
  const getVisiblePageNumbers = () => {
    const delta = 2
    const range = []
    const rangeWithDots = []
    let l

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i)
      }
    }

    for (const i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1)
        } else if (i - l !== 1) {
          rangeWithDots.push("...")
        }
      }
      rangeWithDots.push(i)
      l = i
    }

    return rangeWithDots
  }

  return (
    <div className="p-6">
      <div className="max-w-none mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <History className="h-7 w-7 text-[#1a2da6]" />
              Historial de Compras
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Listado de todas las órdenes de compra registradas
            </p>
          </div>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
          </div>
        ) : ordenes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No hay órdenes de compra registradas</p>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider rounded-tl-lg">
                        OC / Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Proveedor / RUT
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Categoría
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        N° Factura
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider rounded-tr-lg min-w-[280px]">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {currentOrdenes.map((orden, index) => {
                      const isEven = index % 2 === 0
                      return (
                        <tr 
                          key={orden.id}
                          className={cn(
                            "transition-colors",
                            isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850",
                            "hover:bg-blue-50 dark:hover:bg-blue-950"
                          )}
                        >
                          {/* OC / Fecha */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-mono font-semibold text-[#1a2da6] dark:text-blue-300">
                                {orden.numeroOC}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {toDateSafe(orden.fechaOC) ? format(toDateSafe(orden.fechaOC)!, "dd/MM/yyyy", { locale: es }) : "-"}
                              </span>
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-semibold">
                              {getTipoOCLabel(orden.tipoOC)}
                            </Badge>
                          </td>

                          {/* Proveedor / RUT */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={orden.nombreProveedor}>
                                {orden.nombreProveedor}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {orden.rutProveedor}
                              </span>
                            </div>
                          </td>

                          {/* Monto */}
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 font-bold">
                              $ {formatMonto(orden.monto)}
                            </Badge>
                          </td>

                          {/* Categoría */}
                          <td className="px-6 py-4 text-center">
                            {orden.categoria ? (
                              <span className="text-xs capitalize bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-1 rounded font-medium">
                                {orden.categoria}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          {/* N° Factura */}
                          <td className="px-6 py-4 text-center">
                            {orden.numeroFactura ? (
                              <span className="font-semibold text-green-600 dark:text-green-400 text-sm">
                                {orden.numeroFactura}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic text-xs">Sin factura</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-6 py-4 text-center">
                            <Badge
                              className={cn(
                                "font-semibold capitalize",
                                orden.estado === "completado"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              )}
                            >
                              {orden.estado}
                            </Badge>
                          </td>

                          {/* Acciones */}
                          <td className="px-6 py-4 whitespace-nowrap text-center min-w-[280px]">
                            <div className="flex items-center justify-center gap-2 flex-nowrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditarOrden(orden)}
                                className="h-8 text-xs hover:bg-[#1a2da6] hover:text-white"
                                title="Editar orden"
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAgregarFactura(orden)}
                                className="h-8 text-xs hover:bg-blue-600 hover:text-white"
                                title="Agregar o editar número de factura"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {orden.numeroFactura ? "N° Factura" : "N° Factura"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEliminarOrden(orden)}
                                className="h-8 text-xs hover:bg-red-600 hover:text-white text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
                                title="Eliminar orden"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
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

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 sm:px-6 rounded-lg shadow-sm">
                <div className="flex flex-1 justify-between sm:hidden">
                  <Button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    variant="outline"
                    size="sm"
                  >
                    Anterior
                  </Button>
                  <Button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    size="sm"
                  >
                    Siguiente
                  </Button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Mostrando{" "}
                      <span className="font-medium">{indexOfFirstItem + 1}</span>
                      {" "}-{" "}
                      <span className="font-medium">
                        {Math.min(indexOfLastItem, ordenes.length)}
                      </span>
                      {" "}de{" "}
                      <span className="font-medium">{ordenes.length}</span>
                      {" "}órdenes de compra
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <Button
                        onClick={goToFirstPage}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                        className="rounded-l-md"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {getVisiblePageNumbers().map((pageNumber, idx) =>
                        pageNumber === "..." ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-300 dark:ring-gray-600"
                          >
                            ...
                          </span>
                        ) : (
                          <Button
                            key={pageNumber}
                            onClick={() => goToPage(pageNumber as number)}
                            variant={currentPage === pageNumber ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              currentPage === pageNumber && "bg-[#1a2da6] hover:bg-[#1a2da6]/90"
                            )}
                          >
                            {pageNumber}
                          </Button>
                        )
                      )}

                      <Button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        size="sm"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={goToLastPage}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        size="sm"
                        className="rounded-r-md"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog para agregar número de factura */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedOrden?.numeroFactura ? "Editar" : "Agregar"} Número de Factura
            </DialogTitle>
            <DialogDescription>
              Orden de Compra: <strong>{selectedOrden?.numeroOC}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="numeroFactura">Número de Factura</Label>
              <Input
                id="numeroFactura"
                placeholder="Ej: FACT-2024-001"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value.toUpperCase())}
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
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog edición completa de la OC */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Orden de Compra</DialogTitle>
            <DialogDescription>
              Modifique los datos de la orden. Los cambios se guardarán en el historial.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Fecha OC</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start", !editFecha && "text-muted-foreground")} disabled={isSaving}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editFecha ? format(editFecha, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={editFecha} onSelect={setEditFecha} locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>N° OC</Label>
              <Input value={editNumeroOC} onChange={(e) => setEditNumeroOC(e.target.value.toUpperCase())} className="uppercase" disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>Tipo OC</Label>
              <Select value={editTipoOC} onValueChange={setEditTipoOC} disabled={isSaving}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AS">Ayuda Social</SelectItem>
                  <SelectItem value="CA">Compra Ágil</SelectItem>
                  <SelectItem value="TD">Trato Directo</SelectItem>
                  <SelectItem value="CM">Convenio Marco</SelectItem>
                  <SelectItem value="ES">Excluida del Sistema</SelectItem>
                  <SelectItem value="LI">Licitación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editTipoOC === "AS" && (
              <div className="space-y-2">
                <Label>Categoría (Ayuda Social)</Label>
                <Input value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} placeholder="Ej: salud" disabled={isSaving} />
              </div>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Nombre proveedor</Label>
              <Input value={editNombreProveedor} onChange={(e) => setEditNombreProveedor(e.target.value)} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>RUT proveedor</Label>
              <Input value={editRutProveedor} onChange={(e) => setEditRutProveedor(e.target.value)} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <Input
                  value={editMontoDisplay}
                  onChange={(e) => { const v = e.target.value; setEditMontoDisplay(formatNumber(v)); setEditMonto(v.replace(/\D/g, "")); }}
                  className="pl-8"
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>N° Factura</Label>
              <Input value={editNumeroFactura} onChange={(e) => setEditNumeroFactura(e.target.value.toUpperCase())} className="uppercase" disabled={isSaving} placeholder="Opcional" />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editEstado} onValueChange={setEditEstado} disabled={isSaving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleGuardarEdicionOrden} disabled={isSaving} className="bg-[#1a2da6] hover:bg-[#1a2da6]/90">
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminar OC */}
      <AlertDialog open={!!ordenToDelete} onOpenChange={(open) => !open && setOrdenToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta orden de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la orden <strong>{ordenToDelete?.numeroOC}</strong> del historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarEliminarOrden}
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

