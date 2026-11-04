# Estudio de videojuegos con Claude Code

Este repositorio está preparado para crear videojuegos con Claude Code. Incluye dos proyectos de la comunidad:

| Qué | De dónde | Qué aporta |
|---|---|---|
| **Claude Code Game Studios** | [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (MIT) | 49 agentes que funcionan como un estudio (director creativo, programadores, artistas, QA…), 74 comandos, hooks de validación y plantillas de documentos. |
| **awesome-gamedev-agent-skills** | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (Apache-2.0) | 77 skills técnicas para Godot, Unity, Unreal, Phaser, three.js, pygame, Roblox… y un `router` que carga solo las que hacen falta. |

## Cómo empezar

1. Abre Claude Code **en la carpeta raíz de este repositorio**. Si lo abres en una subcarpeta, no se cargan los hooks ni las reglas.
2. Escribe `/start` y cuéntale tu idea de juego.
3. Comandos útiles:
   - `/brainstorm`: desarrollar la idea del juego.
   - `/prototype`: hacer un prototipo rápido.
   - `/dev-story`: programar la siguiente tarea.
   - `/help`: qué hacer a continuación.
   - `/settings`: ver o cambiar la configuración (por ejemplo, `modes.rigor`).

## Dónde está cada cosa

- `.claude/agents/`: los agentes del estudio.
- `.claude/skills/`: los comandos del estudio y las skills de motores y géneros.
- `.claude/hooks/` y `.claude/settings.json`: validaciones automáticas y reglas de seguridad.
- `project.yaml`: la configuración del proyecto (motor, nivel de rigor…).
- `src/`, `design/`, `production/`: el código, el diseño y la planificación del juego.
- `third_party/`: las licencias de las skills de terceros.

`README.md` es la documentación original de Claude Code Game Studios, en inglés.
