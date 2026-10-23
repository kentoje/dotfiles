-- Next/previous agent: cycles focus through every pane running a coding agent,
-- across all sessions, like herdr's next_agent / previous_agent.
-- An agent pane is one whose foreground process is a known agent CLI.

local TERMINAL = "com.superlogical.terminal"
local AGENT_PROCESS_NAMES = {
  claude = true, codex = true, pi = true, omp = true, opencode = true,
  gemini = true, amp = true, aider = true, droid = true, ["cursor-agent"] = true,
  crush = true, goose = true,
}

local function basename(path)
  if not path then return nil end
  return (path:gsub("^%-", ""):match("([^/]+)$"))
end

local function isAgentProcess(fg)
  if not fg then return false end
  return AGENT_PROCESS_NAMES[fg.name] == true
    or AGENT_PROCESS_NAMES[basename(fg.argv0)] == true
    or AGENT_PROCESS_NAMES[basename(fg.invoked_path)] == true
end

--- Lists agent panes as { session_id, window_id, block_id }, in session,
--- window, then block order.
local function listAgentPanes()
  local panes = {}
  local sessions = rex.call("session.list")
  for _, session in ipairs((sessions and sessions.sessions) or {}) do
    local blocks = rex.session.list_blocks{ session_id = session.session_id }
    for _, block in ipairs((blocks and blocks.blocks) or {}) do
      if block.placement == "placed" and block.creator_name == TERMINAL then
        local proc = rex.block.call(TERMINAL, "process", { block_id = block.block_id })
        if proc and isAgentProcess(proc.foreground) then
          panes[#panes + 1] = {
            session_id = session.session_id,
            window_id = block.window_id,
            block_id = block.block_id,
          }
        end
      end
    end
  end
  return panes
end

local function focusAgentPane(ctx, step)
  local panes = listAgentPanes()
  if #panes == 0 then return end

  local current = 0
  for i, pane in ipairs(panes) do
    if pane.block_id == ctx.block_id then current = i end
  end
  local index
  if current == 0 then
    index = step > 0 and 1 or #panes
  else
    index = ((current - 1 + step) % #panes) + 1
  end
  local target = panes[index]

  rex.session.focus_window{ session_id = target.session_id, window_id = target.window_id }
  rex.session.focus_block{ session_id = target.session_id, block_id = target.block_id }
  -- Each client picks its own visible tab, so the server-side focus_window
  -- above doesn't change what the app shows. Ask the app itself to switch,
  -- even within the same session.
  rex.client.queue("session.select", { session_id = target.session_id, window_id = target.window_id })
end

rex.action{
  name = "focus_next_agent_pane",
  title = "Focus Next Agent Pane",
  category = "Agents",
  keywords = "agent claude codex pi next cycle",
  run = function(ctx) focusAgentPane(ctx, 1) end,
}

rex.action{
  name = "focus_previous_agent_pane",
  title = "Focus Previous Agent Pane",
  category = "Agents",
  keywords = "agent claude codex pi previous cycle",
  run = function(ctx) focusAgentPane(ctx, -1) end,
}
