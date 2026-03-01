/**
 * Declaración de tipos para el plugin jspdf-autotable.
 * Extiende la interfaz jsPDF para que TypeScript reconozca el método autoTable,
 * usado en lib/pdf-generator.ts para dibujar tablas en el PDF del CDP.
 */
import "jspdf"

declare module "jspdf" {
  interface jsPDF {
    /** Dibuja una tabla en el PDF con opciones de tema, estilos y celdas */
    autoTable: (options: any) => jsPDF
  }
}
