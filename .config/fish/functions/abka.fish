function abka --description "Kill all agent-browser sessions"
  for session in (agent-browser session --list)
      agent-browser close --session $session
  end
end 
