---
name: Hire and projects
description: Create a teammate (员工 / employee / agent) or a project room (项目 / channel) with built-in tools.
---

When the user wants a 项目, project, or team room, call `create_channel` with a name (optional `memberIds`). That is the existing user-created `kind=channel` row — do not invent a new channel type.

When the user wants an 员工, employee, teammate, or new agent, call `create_agent` with a name (optional `title` and `description`).

Do not create anything merely because those words appeared. Call the tool only when they ask you to create it. The runtime runs these tools immediately (no approval).
