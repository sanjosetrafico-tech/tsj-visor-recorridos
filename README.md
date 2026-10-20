# Visor General de Recorridos TSJ

Proyecto independiente del dashboard TSJ. No comparte archivos, despliegues ni configuración con él.

Mapa de calles OpenStreetMap con Leaflet 1.9.4 incluido localmente, selección individual de los 13 mapas, colores propios, filtros de ida/vuelta/sin identificar, paradas opcionales, buscador, encuadre y enlaces a los originales. La selección se conserva en este navegador.

## Fuentes y acceso

Los 13 mapas se identificaron en la carpeta provista: https://drive.google.com/drive/folders/19sxVSeKEC8K1Dhpzs03g_URklKF5-tjW

`sources.json` conserva los identificadores y colores. Incluye las versiones B y Nueva B, y P y propuesta P1–P2–P3 como opciones separadas. No se presume que una propuesta reemplace un recorrido vigente. Se verificó la descarga anónima HTTP 200 de los 13 KML y su geometría el 20/10/2026.

Los sentidos se extraen de etiquetas del trazado o carpetas; los tramos sin etiqueta explícita se muestran como **Sin identificar**. La Línea M contiene dos geometrías de propuesta sin sentido identificado. No se inventan recorridos ni sentidos.

## Sincronización y publicación

El flujo `.github/workflows/pages.yml` descarga y valida los 13 KML cada 30 minutos (minutos 7 y 37), al actualizar main o mediante ejecución manual. Convierte KML a GeoJSON y despliega `docs/` en GitHub Pages mediante Actions. Si una fuente falla, el flujo falla y no despliega: sigue publicada la última versión completa. Los errores quedan visibles en GitHub Actions. La página marca datos con más de una hora como pendientes de actualización.

**GitHub Actions puede retrasar u omitir ejecuciones programadas; no garantiza una frecuencia exacta de 30 minutos.** El navegador consulta el último archivo publicado cada 30 minutos y al volver a la pestaña. El botón Actualizar consulta la versión publicada; no dispara la descarga de My Maps. No hay claves ni un proxy CORS público en el navegador.

La sincronización actualiza los contenidos de los 13 identificadores registrados. Agregar o reemplazar mapas en la carpeta requiere actualizar `sources.json`; no se consulta automáticamente el inventario privado de Drive.

En GitHub: Settings → Pages → Source: **GitHub Actions**. Requiere Actions habilitado y permisos Pages/id-token de escritura para este flujo. El despliegue utiliza el entorno `github-pages`.

## Validación local

Python 3.12 o posterior, sin dependencias adicionales:

```sh
python -m unittest discover -s tests -v
python scripts/sync.py
python -m http.server 8080 --directory docs
```

Abrir http://localhost:8080. El script aborta ante respuestas HTML, XML inválido, geometrías vacías, coordenadas no finitas o fuera de rango y KML con enlaces externos. El reemplazo del archivo de datos es atómico.

Para convertir KML descargados previamente: `python scripts/sync.py --local-kml DIRECTORIO`, con archivos nombrados `ID.kml`.

Los mosaicos de OpenStreetMap y las fuentes de Google requieren conexión. La disponibilidad de calles depende del servicio de mosaicos. La descarga de datos se hace en el servidor de Actions, evitando depender de CORS de My Maps.

Leaflet © Vladimir Agafonkin y colaboradores, licencia BSD-2-Clause. Ver `docs/vendor/LICENSE`.
