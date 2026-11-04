# Gremio de Mala Muerte

Un **juego incremental de rol con humor** para móvil y PC. Diriges un gremio de aventureros en quiebra: tus héroes luchan solos por una mazmorra de 100 pisos para derrotar a **Lord Casero**, el casero que sube el alquiler de todo el reino. Dura **unas 10 horas** y tiene final.

- Equipo de hasta 4 héroes de 6 clases (Guerrero, Maga, Arquero, Clérigo, Ladrona, Bardo) con hitos de poder y habilidades activas.
- Una ciudad que mejora con el botín: Herrería, Mercado, Mina, Santuario, Barracones y Biblioteca.
- 5 zonas con reglas propias (veneno, resistencias, furia...) y jefes con diálogos.
- 4 **Ascensos de Rango** (prestigio) con estrellas ⭐ y 10 talentos permanentes, 28 logros.
- Guardado automático, exportar/importar partida y **progreso sin conexión** (hasta 8 h).
- Pixel art dibujado por código, sonido de 8 bits, sin anuncios ni compras.

## Cómo jugar

| Dónde | Cómo |
|---|---|
| Enlace publicado | Abre la página del juego en el navegador (móvil o PC). |
| En local | `npm run serve` y abre <http://localhost:8123>. |
| GitHub Pages | Fusiona en `main` y activa *Ajustes → Pages → Source: GitHub Actions*; el flujo `.github/workflows/pages.yml` lo publica. |
| Como app | Desde el navegador, "Añadir a pantalla de inicio" / "Instalar" (funciona sin conexión). |

No necesita instalar nada más: es HTML + JavaScript sin dependencias. Tu partida se guarda en el navegador; usa **Más → Exportar** para pasarla a otro dispositivo.

## Desarrollo

```bash
npm test            # 27 pruebas del motor (rápidas)
npm run test:e2e    # 10 pruebas en navegador real con Playwright
npm run sim         # un jugador automático juega la partida entera y mide su duración
node tools/calibrate.js --write   # recalibra la dificultad por piso (src/js/floors.js)
npm run build       # un solo archivo en dist/ para publicar como página
```

| Archivo | Qué hace |
|---|---|
| `src/js/data.js` | Todos los datos y números de equilibrio (héroes, enemigos, talentos, historia...). |
| `src/js/floors.js` | Tabla de dificultad por piso (la genera `tools/calibrate.js`). |
| `src/js/core.js` | Motor: combate, compras, ascenso, sin conexión, guardado. Sin DOM, se prueba en Node. |
| `src/js/sprites.js`, `scene.js` | Pixel art por código y escena de combate. |
| `src/js/ui.js`, `main.js` | Interfaz, ventanas, bucle de juego. |
| `tools/sim.js`, `calibrate.js`, `tune.js` | Simulador de economía y calibración. |
| `design/game-brief.md` | Diseño de una página. |

### Cómo se ajusta la duración

El simulador (`tools/sim.js`) juega con el motor real: lanza habilidades, toca, compra lo más rentable y asciende. `tools/calibrate.js` busca, zona por zona, la dificultad para que el bot tarde ~50, 75, 100, 125 y 150 minutos en cada recorrido (≈8 h en total); una persona real, algo menos eficiente, tarda cerca de 10 h. Si cambias héroes, costes o multiplicadores, vuelve a ejecutar la calibración y las pruebas.

## El estudio de IA (plantilla)

Este repositorio también incluye la plantilla [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (49 agentes y 74 comandos como `/start`, `/brainstorm`, `/dev-story`) y las skills de [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) en `.claude/`. Abre Claude Code en la raíz del repositorio para usarlos. `README.md` es la documentación original de la plantilla, en inglés.
