# Uber Finanzas

**Antes de cualquier tarea en este repo, carga la skill `uber-finanzas`** (`.claude/skills/uber-finanzas/SKILL.md`). Trae la arquitectura, las convenciones y el flujo funcionalidad → aprobación → PR → merge → release.

Lo mínimo aunque no la cargues:

- El usuario final (el papá de Dafel) tiene **datos reales solo en su celular**: esquema de DB solo aditivo, nunca pedirle desinstalar, nunca cambiar la llave de firma (`--freeze-credentials`).
- Cuando Dafel aprueba una funcionalidad, eso autoriza PR + merge + publicación sin volver a preguntar.
- Repo público: cero secretos en el código.
- Verificación antes de un PR: `npm run check` y `npx expo-doctor`.
