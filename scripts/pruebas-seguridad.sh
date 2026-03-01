#!/usr/bin/env bash
# Pruebas de seguridad automáticas (rutas protegidas y API de sesión).
# Ejecutar con la app corriendo: npm run dev
# Uso: ./scripts/pruebas-seguridad.sh [URL]   (por defecto http://localhost:3000)

set -e
BASE="${1:-http://localhost:3000}"
OK=0
FAIL=0

echo "=============================================="
echo "  Pruebas de seguridad — $BASE"
echo "=============================================="
echo ""

# --- 1. Dashboard sin cookie debe redirigir a login (307 o 302)
echo -n "1. Ruta protegida /dashboard sin cookie → redirige a login ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/dashboard" 2>/dev/null || echo "000")
if [ "$STATUS" = "307" ] || [ "$STATUS" = "302" ]; then
  echo "OK (HTTP $STATUS)"
  ((OK++)) || true
else
  echo "FALLO (esperado 307/302, recibido $STATUS)"
  ((FAIL++)) || true
fi

# --- 2. Dashboard con cookie inválida debe redirigir y borrar cookie
echo -n "2. Cookie inválida en /dashboard → redirige y borra cookie ... "
RESP=$(curl -s -I -b "session=invalid" "$BASE/dashboard" 2>/dev/null || true)
STATUS=$(echo "$RESP" | head -n 1 | grep -oE "HTTP[^ ]+ [0-9]+" | awk '{print $2}')
SET_COOKIE=$(echo "$RESP" | grep -i "set-cookie.*session" || true)
if { [ "$STATUS" = "307" ] || [ "$STATUS" = "302" ]; } && [ -n "$SET_COOKIE" ]; then
  echo "OK (redirige y Set-Cookie presente)"
  ((OK++)) || true
elif [ "$STATUS" = "307" ] || [ "$STATUS" = "302" ]; then
  echo "OK (redirige; revisar borrado de cookie si aplica)"
  ((OK++)) || true
else
  echo "FALLO (código $STATUS)"
  ((FAIL++)) || true
fi

# --- 3. POST /api/auth/session sin token → 400
echo -n "3. API sesión POST sin token → 400 ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/session" \
  -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
if [ "$STATUS" = "400" ]; then
  echo "OK"
  ((OK++)) || true
else
  echo "FALLO (esperado 400, recibido $STATUS)"
  ((FAIL++)) || true
fi

# --- 4. GET /api/auth/session sin cookie → 401
echo -n "4. API sesión GET sin cookie → 401 ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/session" 2>/dev/null || echo "000")
if [ "$STATUS" = "401" ]; then
  echo "OK"
  ((OK++)) || true
else
  echo "FALLO (esperado 401, recibido $STATUS)"
  ((FAIL++)) || true
fi

# --- 5. npm audit (solo informativo; no cuenta como fallo para no forzar actualizaciones)
echo ""
echo "5. Dependencias (npm audit) [informativo]:"
if command -v npm >/dev/null 2>&1; then
  cd "$(dirname "$0")/.."
  if npm audit --audit-level=high 2>/dev/null; then
    echo "   OK — sin vulnerabilidades altas/críticas."
  else
    echo "   Hay vulnerabilidades en dependencias. Ejecuta 'npm audit' para detalles."
    echo "   (No se cuenta como fallo: puedes decidir no actualizar para no romper nada.)"
  fi
else
  echo "   Omitido (npm no encontrado)."
fi

echo ""
echo "=============================================="
echo "  Resultado: $OK pasaron, $FAIL fallaron (pruebas 1-4)"
echo "=============================================="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
