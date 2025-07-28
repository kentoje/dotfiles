function sync_claude_all
    echo "Syncing all Claude configuration..."
    
    sync_claude_agents
    if test $status -ne 0
        echo "Error syncing Claude agents"
        return 1
    end
    
    sync_claude_commands
    if test $status -ne 0
        echo "Error syncing Claude commands"
        return 1
    end
    
    sync_claude_settings
    if test $status -ne 0
        echo "Error syncing Claude settings"
        return 1
    end
    
    echo "All Claude configuration synced successfully!"
end