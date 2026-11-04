# Gremio de Mala Muerte

Un **juego incremental de rol con humor** para móvil y PC. Diriges un gremio de aventureros en quiebra: tus héroes luchan solos por una mazmorra de 100 pisos para derrotar a **Lord Casero**, el casero que sube el alquiler de todo el reino. Dura **unas 10 horas** y tiene final.

- Equipo de hasta 4 héroes de 6 clases (Guerrero, Maga, Arquero, Clérigo, Ladrona, Bardo) con hitos de poder y habilidades activas. **El de más aggro (el tanque) recibe todos los golpes directos**; el veneno de algunas zonas daña a todos.
- Una ciudad que mejora con el botín: Herrería, Mercado, Mina, Santuario, Barracones y Biblioteca.
- **Recompensas por todas partes** (ver `design/engagement.md`): golpes críticos reales, combo de bajas seguidas y **Frenesí** (×2 de daño y ×1,5 de oro); **cofres** de bronce, plata y oro con animación de apertura; **24 reliquias** coleccionables en 4 rarezas que suben de nivel; **misiones** siempre abiertas y **recompensa diaria** de 7 días; **36 especializaciones** de héroe (3 nodos de 2 caminos por héroe); el **Goblin del Tesoro** (evento aleatorio, se atrapa tocándolo); **Bestiario** con hitos, y más de 80 **logros** con cofre. Música distinta en cada zona.
- 5 zonas con reglas propias (veneno, resistencias, furia...) y jefes con diálogos.
- 4 **Ascensos de Rango** (prestigio) con estrellas ⭐ y 10 talentos permanentes.
- Guardado automático, **guardado en la nube** (tu cuenta de claude.ai: sigues en cualquier dispositivo), exportar/importar y **progreso sin conexión** (hasta 8 h).
- Pixel art dibujado por código, sonido de 8 bits, sin anuncios ni compras.

## Cómo jugar

| Dónde | Cómo |
|---|---|
| Enlace publicado (claude.ai) | Ábrelo con tu sesión iniciada, en el móvil o en el PC. **Tu partida se guarda en tu cuenta** y te sigue a cualquier dispositivo. |
| En local | `npm run serve` y abre <http://localhost:8123>. |
| GitHub Pages (enlace público, sin cuenta) | Una vez: *Ajustes → Pages → Source: GitHub Actions*. Luego, en la pestaña *Actions*, ejecuta **Publicar el juego en GitHub Pages** (*Run workflow*). Queda en `https://<usuario>.github.io/<repositorio>/`. Aquí no hay nube: la partida se guarda en cada navegador (usa Exportar/Importar para moverla). Si el repositorio es privado, GitHub exige un plan de pago para Pages. |
| Como app | Desde el navegador, "Añadir a pantalla de inicio" / "Instalar" (funciona sin conexión). |

No necesita instalar nada más: es HTML + JavaScript sin dependencias.

### Jugar con amigos (sin cuenta de claude.ai)

Publica el juego en GitHub Pages (ver la tabla de arriba) y pasa el enlace. Cualquiera puede jugar desde el móvil o el PC **sin cuenta ni instalar nada**:

- **Cada persona tiene su propia partida**, guardada en su navegador. No se mezclan.
- **Más → Invitar a un amigo** abre el menú de compartir del móvil (o copia el enlace).
- **Más → Instalar como app** (o «Añadir a pantalla de inicio»): funciona también sin conexión.
- Para cambiar de dispositivo: **Más → Exportar** da un **código**, un **archivo .txt** o un **enlace** que abre el juego con tu partida (te pregunta antes de reemplazar la que ya tengas). Con **Importar** lo recuperas.

### Guardado y dispositivos

- Siempre se guarda en el navegador. Con el enlace de claude.ai y la sesión iniciada, **también se sube a tu cuenta** (un documento privado por persona que nadie más puede leer) cada pocos minutos y al ocultar o cerrar la página.
- Al abrir el juego en otro dispositivo se carga solo la partida de la nube. Si ese dispositivo ya tenía otra partida distinta, el juego **pregunta con cuál seguir** y no pisa nada hasta que decides.
- Si juegas en dos dispositivos a la vez y uno guarda, el otro te avisa para que elijas.
- En **Más → Partida en la nube** ves el estado y puedes subir o cargar a mano. **Exportar/Importar** sirve siempre, con o sin cuenta.

## Desarrollo

```bash
npm test            # 56 pruebas del motor (rápidas)
npm run test:e2e    # 40 pruebas en navegador real (Playwright): nube simulada, compartir partidas, subcarpeta, modo sin conexión y la capa de recompensas
npm run sim         # un jugador automático juega la partida entera y mide su duración
node tools/calibrate.js --write   # recalibra la dificultad por piso (src/js/floors.js)
npm run build       # un solo archivo en dist/ para publicar como página
```

| Archivo | Qué hace |
|---|---|
| `src/js/data.js` | Todos los datos y números de equilibrio (héroes, enemigos, talentos, historia...). |
| `src/js/floors.js` | Tabla de dificultad por piso (la genera `tools/calibrate.js`). |
| `src/js/core.js` | Motor: combate, críticos, combo, frenesí, compras, ascenso, sin conexión, guardado. Sin DOM, se prueba en Node. |
| `src/js/data_loot.js`, `loot.js` | Datos y lógica de cofres, reliquias, misiones, recompensa diaria, especializaciones, goblin y bestiario. |
| `src/js/ui_loot.js` | Pestaña Botín, revelado de cofres, especializaciones, HUD de combo/frenesí/meta. |
| `src/js/sprites.js`, `scene.js` | Pixel art por código y escena de combate. |
| `src/js/ui.js`, `main.js` | Interfaz, ventanas, bucle de juego y guardado. |
| `src/js/cloud.js` | Guardado en la nube (solo activo en la página publicada de claude.ai). |
| `tools/sim.js`, `calibrate.js`, `tune.js` | Simulador de economía y calibración. |
| `design/game-brief.md`, `design/engagement.md` | Diseño de una página y de la capa de recompensas (con la investigación en que se basa). |

### Cómo se ajusta la duración

El simulador (`tools/sim.js`) juega con el motor real: lanza habilidades, toca, compra lo más rentable y asciende. `tools/calibrate.js` busca, zona por zona, la dificultad para que el bot tarde ~50, 75, 100, 125 y 150 minutos en cada recorrido (≈8 h en total); una persona real, algo menos eficiente, tarda cerca de 10 h. Si cambias héroes, costes o multiplicadores, vuelve a ejecutar la calibración y las pruebas.

## El estudio de IA (plantilla)

Este repositorio también incluye la plantilla [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (49 agentes y 74 comandos como `/start`, `/brainstorm`, `/dev-story`) y las skills de [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) en `.claude/`. Abre Claude Code en la raíz del repositorio para usarlos. `README.md` es la documentación original de la plantilla, en inglés.
