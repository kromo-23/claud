# Game Brief: Gremio de Mala Muerte

**One-sentence pitch:** Un incremental de rol con humor en el que diriges un gremio de aventureros en quiebra: tus héroes luchan solos por una mazmorra de 100 "pisos" para derrotar a Lord Casero, y tú decides a quién reclutar, qué equipar y qué ciudad construir con el botín.

## Core loop
- El equipo (hasta 4 héroes de 6 clases) lucha solo piso a piso (5 enemigos por piso, jefe cada 5 pisos) → suelta oro, hierro y cristales.
- Gastas el botín en subir héroes, forjar equipo, mejorar la ciudad y reclutar → el equipo aguanta más pisos.
- Al chocar con el jefe de zona, haces un **Ascenso de Rango** (prestigio): reinicias el recorrido, ganas ⭐ para talentos permanentes y se abre la siguiente zona.
- Opcional y activo: tocar al enemigo, lanzar habilidades a mano, cambiar el equipo según las resistencias de cada zona.

## Player goal & fail state — what "working" looks like
- Objetivo: derrotar a Lord Casero en el piso 100 (~10 h de juego con 4 ascensos). Después se desbloquea la Torre Infinita.
- No hay game over. Si todo el equipo cae, retrocede un piso, farmea 8 enemigos y reintenta solo. Cerrar el juego no pierde progreso (guardado automático + progreso sin conexión).

## MVP — what must exist to be the game
1. Combate automático con héroes con HP, resistencias físicas/mágicas y habilidades activas.
2. 6 héroes (Guerrero, Maga, Arquero, Clérigo, Ladrona, Bardo) con niveles, hitos de poder y habilidad activa.
3. Ciudad: Herrería (3 líneas de equipo), Mercado, Mina, Santuario, Barracones (huecos de equipo), Biblioteca (investigaciones y automatización).
4. 5 zonas con reglas propias (veneno, resistencias, furia, mezcla), jefes y diálogos con humor.
5. Ascenso de Rango ×4 con Estrellas y árbol de talentos; logros con bonus.
6. Guardado automático, exportar/importar, progreso sin conexión.
7. Jugable en PC y móvil (interfaz táctil, instalable como app).

## Out of scope — not building this
- Multijugador, ranking online, anuncios, compras o monetización.
- Arte dibujado a mano: todo el pixel art se genera por código.
- Varios idiomas (solo español).

## Build order
1. Motor sin interfaz (`src/js/core.js`) + datos, probado en Node.
2. Simulador de economía (`tools/sim.js`) para ajustar la duración a ~10 h.
3. Pixel art + escena de combate.
4. Interfaz (pestañas, héroes, ciudad, ascenso, ajustes) responsive.
5. Pulido: sonido, textos, PWA, pruebas en móvil.

---
**Who it's for / what they feel:** Jugadores de incrementales que quieren un RPG con humor y toma de decisiones, en sesiones de 5-15 minutos en móvil o PC.

**Art & audio direction:** Pixel art de 16 colores dibujado por código, interfaz oscura cálida, efectos de sonido de 8 bits.

**Reference game:** Clicker Heroes / Melvor Idle: el bucle de héroes que escalan con niveles e hitos y la ciudad que da mejoras, con una duración cerrada y un final.
