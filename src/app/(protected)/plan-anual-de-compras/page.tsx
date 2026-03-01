"use client"

/**
 * Página del Plan Anual de Compras.
 * Lista proyectos desde la colección Firestore "planAnualCompras" con filtros por nombre de proyecto,
 * departamento, tipo de compra y mes; incluye paginación y diálogo para ver detalle de cada ítem.
 */
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar, Search, Loader2, FileText, Filter, Download, Eye, Edit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { db } from "@/lib/firebase"
import { collection, query, getDocs, orderBy, where } from "firebase/firestore"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface PlanAnualCompra {
  id: string
  projectName: string
  goodOrServiceName: string
  department: string
  purchaseType: string
  preparationMonth: string
  publicationMonth: string
}

export default function PlanAnualComprasPage() {
  const [proyectos, setProyectos] = useState<PlanAnualCompra[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterProjectName, setFilterProjectName] = useState<string>("all")
  const [filterDepartment, setFilterDepartment] = useState<string>("all")
  const [filterPurchaseType, setFilterPurchaseType] = useState<string>("all")
  const [filterMonth, setFilterMonth] = useState<string>("all")

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [selectedProyecto, setSelectedProyecto] = useState<PlanAnualCompra | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  /** Carga proyectos desde Firestore (planAnualCompras) ordenados por projectName */
  const loadProyectos = async () => {
    try {
      setIsLoading(true)
      const proyectosRef = collection(db, "planAnualCompras")
      const q = query(proyectosRef, orderBy("projectName", "asc"))
      const querySnapshot = await getDocs(q)

      const proyectosData: PlanAnualCompra[] = []
      querySnapshot.forEach((doc) => {
        proyectosData.push({
          id: doc.id,
          ...doc.data(),
        } as PlanAnualCompra)
      })

      setProyectos(proyectosData)
    } catch (error) {
      console.error("Error al cargar proyectos:", error)
      toast.error("Error al cargar el plan anual de compras")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProyectos()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterProjectName, filterDepartment, filterPurchaseType, filterMonth])

  /** Valores únicos de cada campo para poblar los selectores de filtro */
  const projectNames = Array.from(new Set(proyectos.map((p) => p.projectName).filter(Boolean)))
  const departments = Array.from(new Set(proyectos.map((p) => p.department).filter(Boolean)))
  const purchaseTypes = Array.from(new Set(proyectos.map((p) => p.purchaseType).filter(Boolean)))
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]

  /** Proyectos filtrados por búsqueda y por los selectores (proyecto, departamento, tipo, mes) */
  const filteredProyectos = proyectos.filter((proyecto) => {
    const matchesSearch =
      proyecto.goodOrServiceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proyecto.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proyecto.projectName.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesProjectName = filterProjectName === "all" || proyecto.projectName === filterProjectName
    const matchesDepartment = filterDepartment === "all" || proyecto.department === filterDepartment
    const matchesPurchaseType = filterPurchaseType === "all" || proyecto.purchaseType === filterPurchaseType
    const matchesMonth =
      filterMonth === "all" ||
      proyecto.preparationMonth === filterMonth ||
      proyecto.publicationMonth === filterMonth

    return matchesSearch && matchesProjectName && matchesDepartment && matchesPurchaseType && matchesMonth
  })

  /** Devuelve clases CSS del badge según el tipo de compra */
  const getPurchaseTypeColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      "Licitacion": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "Compra ágil": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "Convenio Marco": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "Trato directo": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      "Excluida del sistema": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      "licitacion": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "compra ágil": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    }
    return colors[type] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  /** Resetea todos los filtros y el término de búsqueda */
  const clearFilters = () => {
    setSearchTerm("")
    setFilterProjectName("all")
    setFilterDepartment("all")
    setFilterPurchaseType("all")
    setFilterMonth("all")
  }

  const totalPages = Math.ceil(filteredProyectos.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentProyectos = filteredProyectos.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const goToFirstPage = () => {
    setCurrentPage(1)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const goToLastPage = () => {
    setCurrentPage(totalPages)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  /** Devuelve array de números/elipsis para mostrar en la paginación (1 ... 4 5 6 ... 20) */
  const getVisiblePageNumbers = () => {
    const delta = 2
    const range = []
    const rangeWithDots = []

    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i)
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, "...")
    } else {
      rangeWithDots.push(1)
    }

    rangeWithDots.push(...range)

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push("...", totalPages)
    } else {
      rangeWithDots.push(totalPages)
    }

    return rangeWithDots
  }

  /** Abre el diálogo de detalle con el proyecto seleccionado */
  const handleViewDetails = (proyecto: PlanAnualCompra) => {
    setSelectedProyecto(proyecto)
    setIsDialogOpen(true)
  }

  return (
    <div className="w-full py-6 px-4">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-8 w-8 text-[#1a2da6]" />
              Plan Anual de Compras
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Gestión y seguimiento del plan anual de adquisiciones municipales
            </p>
          </div>
        </div>

        {/* Filtros y Búsqueda */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros y Búsqueda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Búsqueda general */}
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Buscar por nombre, departamento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Filtro por Nombre del Proyecto */}
              <div>
                <Select value={filterProjectName} onValueChange={setFilterProjectName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proyectos</SelectItem>
                    {projectNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Departamento */}
              <div>
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los departamentos</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Tipo de Compra */}
              <div>
                <Select value={filterPurchaseType} onValueChange={setFilterPurchaseType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de compra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {purchaseTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Mes */}
              <div>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los meses</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Botón limpiar filtros */}
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={clearFilters} size="sm">
                Limpiar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Proyectos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Proyectos del Plan Anual ({filteredProyectos.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
              </div>
            ) : filteredProyectos.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No se encontraron proyectos</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-auto">
                    <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider rounded-tl-lg">
                          Nombre del Proyecto
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Bien o Servicio
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Departamento
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Tipo de Compra
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Mes Preparación
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Mes Publicación
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider rounded-tr-lg">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {currentProyectos.map((proyecto, index) => {
                        const isEven = index % 2 === 0
                        return (
                          <tr
                            key={proyecto.id}
                            className={cn(
                              "transition-colors",
                              isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850",
                              "hover:bg-blue-50 dark:hover:bg-blue-950"
                            )}
                          >
                            {/* Nombre del Proyecto */}
                            <td className="px-6 py-4">
                              {proyecto.projectName ? (
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {proyecto.projectName}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Sin proyecto</span>
                              )}
                            </td>

                            {/* Bien o Servicio */}
                            <td className="px-6 py-4">
                              <div className="max-w-md">
                                <span
                                  className="text-sm text-gray-900 dark:text-white truncate block"
                                  title={proyecto.goodOrServiceName}
                                >
                                  {proyecto.goodOrServiceName}
                                </span>
                              </div>
                            </td>

                            {/* Departamento */}
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-900 dark:text-white">
                                {proyecto.department}
                              </span>
                            </td>

                            {/* Tipo de Compra */}
                            <td className="px-6 py-4 text-center">
                              <Badge className={getPurchaseTypeColor(proyecto.purchaseType)}>
                                {proyecto.purchaseType}
                              </Badge>
                            </td>

                            {/* Mes Preparación */}
                            <td className="px-6 py-4 text-center">
                              {proyecto.preparationMonth ? (
                                <span className="text-sm text-gray-900 dark:text-white">
                                  {proyecto.preparationMonth}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Mes Publicación */}
                            <td className="px-6 py-4 text-center">
                              {proyecto.publicationMonth ? (
                                <span className="text-sm text-gray-900 dark:text-white">
                                  {proyecto.publicationMonth}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewDetails(proyecto)}
                                  className="h-8 text-xs hover:bg-[#1a2da6] hover:text-white"
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="bg-white dark:bg-gray-900 px-4 py-3 border-t border-gray-200 dark:border-gray-700 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 flex justify-between sm:hidden">
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
                            <span className="font-medium">
                              {filteredProyectos.length === 0
                                ? 0
                                : startIndex + 1}
                            </span>{" "}
                            a{" "}
                            <span className="font-medium">
                              {Math.min(endIndex, filteredProyectos.length)}
                            </span>{" "}
                            de{" "}
                            <span className="font-medium">
                              {filteredProyectos.length}
                            </span>{" "}
                            resultados
                          </p>
                        </div>
                        <nav className="flex items-center gap-1">
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Detalles */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalles del Proyecto
            </DialogTitle>
            <DialogDescription>
              Información completa del proyecto del plan anual de compras
            </DialogDescription>
          </DialogHeader>

          {selectedProyecto && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Nombre del Proyecto
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">
                    {selectedProyecto.projectName || (
                      <span className="text-gray-400 italic">Sin proyecto</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Departamento
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">
                    {selectedProyecto.department}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Bien o Servicio a Contratar
                </p>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {selectedProyecto.goodOrServiceName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Tipo de Compra
                  </p>
                  <div className="mt-1">
                    <Badge className={getPurchaseTypeColor(selectedProyecto.purchaseType)}>
                      {selectedProyecto.purchaseType}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Mes de Preparación
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">
                    {selectedProyecto.preparationMonth || (
                      <span className="text-gray-400">-</span>
                    )}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Mes de Publicación del Proceso
                </p>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {selectedProyecto.publicationMonth || (
                    <span className="text-gray-400">-</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
