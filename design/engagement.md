# Capa de enganche: recompensas, decisiones y sensaciones

Objetivo: que cada minuto de juego tenga algo que ganar, elegir o sentir, sin castigar a quien juega poco ni exigir atención constante.

## Qué dice la investigación (y qué hago con ello)

| Hallazgo | Fuente | Decisión |
|---|---|---|
| Los incrementales sostienen el interés con recompensas pequeñas y frecuentes (logros) y con elecciones reales entre mejoras. | Wikipedia "Incremental game"; análisis de diseño idle | Más de 70 logros con premio; especializaciones de héroe (2 caminos) en Nv 20/60/120. |
| Cookie Clicker mete un evento aleatorio que aparece, se ve unos 13 s y premia a quien está activo, pero no exige jugar activo. | Wiki de Cookie Clicker, TV Tropes | **Goblin del Tesoro**: aparece cada 1,5-3,5 min, dura ~13 s, premia con cofre; ignorarlo no cuesta nada. |
| Recompensas diarias y objetivos que se renuevan hacen volver; las misiones que aparecen cuando el jugador va a abandonar empujan a seguir. | GameAnalytics, Playio, AFK Arena | **Misiones** encadenadas (siempre 3 abiertas) y **recompensa diaria** con racha indulgente. |
| El tramo medio-final de los idle RPG se vuelve repetitivo y ahí se pierde gente. | Gold & Goblins, estudios de caso idle RPG | Novedad constante en el tramo medio: reliquias, especializaciones, eventos, jefes con cofre. |
| Sesiones flexibles (5 min o 1 h) y paradas claras en las subidas de dificultad. | Game Developer (AFK Arena) | El equipo se refuerza solo tras caer; el progreso sin conexión trae un cofre de bienvenida. |
| "Juice": parpadeo al golpear (50-100 ms), pausa de 2 fotogramas, temblor mayor en críticos pero con tope, sensaciones coherentes entre sí. Probar el juego sin juice para comprobar que la mecánica aguanta. | GDC "Juice it or lose it", guías de game feel | Críticos reales con efectos proporcionales; cada capa nueva es mecánica real, no solo adorno. |
| Ética: premiar el compromiso sin exigir atención constante ni castigar la ausencia. | Análisis de diseño idle | Sin anuncios ni compras. La racha perdona un día. Nada caduca ni se pierde por no entrar. |

## Sistemas nuevos

1. **Críticos reales** (5 % base, ×2,5): números grandes naranjas, pequeño temblor, sonido propio.
2. **Combo** de bajas seguidas (+1 % de oro por baja, hasta +50 %) y **Frenesí**: una barra que se llena matando (y tocando); al llenarse, 8 s con ×2 de daño y ×1,5 de oro. Se activa a mano (botón que pulsa) o solo con la investigación *Instinto Berserker*.
3. **Cofres** (bronce, plata, oro) que se abren con animación de revelado. Caen de jefes, enemigos dorados, goblins, misiones, logros, la recompensa diaria y al volver tras una ausencia larga.
4. **Reliquias**: 24 objetos coleccionables en 4 rarezas (común, rara, épica, legendaria). Los repetidos las suben de nivel; al máximo se convierten en cristales. Un pity garantiza una legendaria cada ~40 tiradas. Bonus por colección.
5. **Misiones**: 3 abiertas siempre, que escalan con el progreso y se encadenan al reclamarlas.
6. **Recompensa diaria** de 7 días.
7. **Especializaciones** por héroe: 3 nodos con 2 opciones cada uno (36 en total), permanentes; reasignar cuesta cristales.
8. **Goblin del Tesoro** (evento aleatorio).
9. **Bestiario** siempre activo: 4 hitos de bajas por tipo de enemigo dan bonus de daño y cristales.
10. **Sensaciones**: hitos de nivel con banner y destello, texto "+X % de daño" al comprar, DPS visible, "siguiente meta", música ambiente por zona y más efectos de sonido.

## Equilibrio

La capa añade poder (reliquias, especializaciones, críticos, frenesí). Se recalibra con `tools/calibrate.js` para que el jugador automático siga tardando ~8 h (≈10 h una persona). El simulador abre cofres, reclama misiones, elige especializaciones y usa el frenesí; no simula la recompensa diaria ni el goblin (se tratan como extra).
