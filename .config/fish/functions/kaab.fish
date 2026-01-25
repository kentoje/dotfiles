
function kaab --description 'Kill all agent-browser sessions'
    for session in (agent-browser session list | grep -v "Active sessions:" | string trim)
        agent-browser close --session $session
    end
end
