# Visor General de Recorridos TSJ

Proyecto independiente del dashboard TSJ. No comparte archivos, despliegues ni configuración con él.

Mapa de calles OpenStreetMap con Leaflet 1.9.4 incluido localmente, selección individual de los mapas disponibles, colores propios, filtros de ida/vuelta/sin identificar, paradas opcionales, buscador, encuadre y enlaces a los originales. La selección se conserva en este navegador.

## Fuentes y acceso

Los mapas se descubren automáticamente en la carpeta provista: https://drive.google.com/drive/folders/19sxVSeKEC8K1Dhpzs03g_URklKF5-tjW

`sources.json` conserva un inventario de referencia para mantener colores estables. En cada sincronización, la carpeta pública de Drive se consulta nuevamente: altas, bajas y renombres de My Maps se incorporan automáticamente. No se presume que una propuesta reemplace un recorrido vigente.

Los sentidos se extraen de etiquetas del trazado o carpetas; los tramos sin etiqueta explícita se muestran como **Sin identificar**. La Línea M contiene dos geometrías de propuesta sin sentido identificado. No se inventan recorridos ni sentidos.

## Sincronización y publicación

El flujo `.github/workflows/pages.yml` descubre los My Maps actuales de la carpeta, descarga y valida sus KML cada 10 minutos, al actualizar main o mediante ejecución manual. Convierte KML a GeoJSON y despliega `docs/` en GitHub Pages mediante Actions. Si una fuente falla, el flujo falla y no despliega: sigue publicada la última versión completa. Los errores quedan visibles en GitHub Actions. La página marca datos con más de una hora como pendientes de actualización.

**GitHub Actions puede retrasar u omitir ejecuciones programadas; no garantiza una frecuencia exacta de 10 minutos.** El navegador consulta el último archivo publicado cada 10 minutos y al volver a la pestaña. El botón Actualizar consulta la versión publicada; no dispara la descarga de My Maps. No hay claves ni un proxy CORS público en el navegador.

La sincronización usa la carpeta pública de Drive como fuente de verdad. Agregar, eliminar o renombrar un My Maps en esa carpeta se refleja automáticamente en la siguiente ejecución válida.

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
