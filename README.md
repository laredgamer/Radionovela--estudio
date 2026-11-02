# RadioNovela Studio

Primera versión funcional de una aplicación PWA para preparar radionovelas y audiolibros dramatizados.

## Requisitos
- Node.js 20 o superior
- npm
- Navegador moderno (Chrome o Edge recomendado)

## Ejecutar en desarrollo
```bash
npm install
npm run dev
```
Abre la dirección local que muestre Vite.

## Crear versión de producción
```bash
npm run build
npm run preview
```
El contenido listo para publicar queda en `dist/`.

## Funciones incluidas
- Importación de guiones TXT, PDF con texto seleccionable y Word DOCX.
- Detección básica de diálogos con el formato `PERSONAJE: texto`.
- Asignación y previsualización de voces españolas disponibles en el navegador.
- Grabación de diálogos desde el micrófono.
- Importación de música y efectos de audio.
- Mezcla y exportación de las grabaciones y pistas importadas a WAV y MP3.
- Interfaz adaptable a móvil y escritorio e instalable como PWA.

## Límites conocidos de esta versión
- Las voces del navegador sirven para previsualizar; la API Web Speech no entrega el audio generado como archivo descargable.
- Para generar locuciones de IA descargables hace falta integrar un proveedor TTS en un backend y guardar la clave API en variables de entorno del servidor, nunca en el navegador.
- La exportación mezcla audio grabado e importado. Los diálogos que solo se previsualizan con voz del navegador no se incorporan a la mezcla.
- Los proyectos `.rns.json` guardan la estructura y asignaciones, pero no incrustan las grabaciones; conserva también los archivos WAV/MP3 exportados.
- PDF escaneados requieren OCR antes de importarlos. Para Word se admite DOCX; convierte los DOC antiguos a DOCX.
- La mezcla organiza los diálogos en orden con pequeños espacios entre bloques; todavía no es una estación multipista con posicionamiento libre por tiempo.

## Próximos hitos sugeridos
1. Backend seguro para TTS IA y selección de proveedor/modelo.
2. Editor multipista con forma de onda, cortes, desplazamiento temporal y fundidos.
3. Persistencia de proyectos y recursos en nube con inicio de sesión.
4. Sincronización entre Android y computadora.
5. Pruebas automatizadas y publicación de APK mediante Trusted Web Activity o Capacitor.

## GitHub
Crea un repositorio vacío llamado `radionovela-studio` en tu cuenta de GitHub y sube el contenido de esta carpeta. No se incluyó ninguna clave API ni credencial.
