/**
 * Layout para rutas públicas (login, forgot-password).
 * Aplica la fuente Onest y un contenedor centrado en pantalla para el formulario de acceso.
 */
import type React from "react";
import { Onest } from "next/font/google";

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`flex min-h-screen flex-col ${onest.className}`}>
      {/* Contenido principal que ocupa el espacio disponible */}
      <main className="grow container mx-auto px-4 py-12 flex items-center justify-center">
        {children}
      </main>
    </div>
  );
}
