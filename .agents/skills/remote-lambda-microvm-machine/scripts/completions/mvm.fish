# Fish completions for the mvm CLI (dev machines on AWS Lambda MicroVMs).
#
# Source of truth lives here, next to the CLI. `mvm setup` symlinks it into
# ~/.config/fish/completions/mvm.fish. To install by hand:
#   ln -sf (pwd)/mvm.fish ~/.config/fish/completions/
#
# Mirrors build_mvm_parser() in ../mvm_cli/cli_main.py; mvm_cli/fish_completion_test.py fails
# when a command or flag is missing here. Machine names come from the local name records
# (no AWS call), so tab stays instant. The hidden `proxy` command is not offered.

# Machine names known on this laptop: one JSON record per machine (see machine_registry.py).
function __mvm_machine_names
    set -l state_dir $HOME/.local/state/mvm
    set -q MVM_STATE_DIR; and set state_dir $MVM_STATE_DIR
    for record in $state_dir/machines/*.json
        path basename --no-extension -- $record
    end
end

# Words after the subcommand that are not flags or flag values: `mvm logs dev --since 2h -f` -> dev.
function __mvm_positional_args
    set -l tokens (commandline -xpc)
    set -l skip_next 0
    for token in $tokens[3..-1]
        if test $skip_next = 1
            set skip_next 0
        else if contains -- $token --ttl --since
            set skip_next 1
        else if not string match -q -- '-*' $token
            echo $token
        end
    end
end

# The devServerPort in a machine's record (records are indented JSON: `"devServerPort": 3101`).
function __mvm_dev_server_port
    set -l state_dir $HOME/.local/state/mvm
    set -q MVM_STATE_DIR; and set state_dir $MVM_STATE_DIR
    set -l record $state_dir/machines/$argv[1].json
    test -f $record; or return
    string match -rg '"devServerPort": (\d+)' <$record
end

# True while the command line needs the NAME of `mvm ssh`, `mvm logs` or `mvm forward` (their first positional).
function __mvm_needs_machine_name
    test (count (__mvm_positional_args)) -eq 0
end

# Machine names not already on the `mvm rm` command line.
function __mvm_names_not_yet_listed
    set -l listed (__mvm_positional_args)
    for name in (__mvm_machine_names)
        contains -- $name $listed; or echo $name
    end
end

complete -c mvm -f
complete -c mvm -s h -l help -d 'Show help'

# Commands (descriptions follow `mvm --help`; fish lists them alphabetically).
complete -c mvm -n __fish_use_subcommand -a new -d 'Start a machine, wait for ssh, add it to herdr, open its tuios session'
complete -c mvm -n __fish_use_subcommand -a rm -d 'Terminate machines, remove them from herdr and tuios'
complete -c mvm -n __fish_use_subcommand -a ls -d 'List machines: state, image, age, time left, herdr, tuios'
complete -c mvm -n __fish_use_subcommand -a ssh -d 'Same as ssh NAME.mvm'
complete -c mvm -n __fish_use_subcommand -a tuios -d "Open the machine's tuios session again"
complete -c mvm -n __fish_use_subcommand -a forward -d "Reach the machine's dev servers at localhost:PORT"
complete -c mvm -n __fish_use_subcommand -a logs -d "The machine's logs: setup, hooks, WIP saves"
complete -c mvm -n __fish_use_subcommand -a setup -d 'One-time: AWS stack, ssh config, PATH, completion'
complete -c mvm -n __fish_use_subcommand -a secrets -d 'Copy dev env vars into the machines secret'
complete -c mvm -n __fish_use_subcommand -a image -d 'Rebuild the dev image'

# mvm new [NAME] [--ttl 8h] [--json]: NAME is a new name, so nothing to complete for it.
complete -c mvm -n '__fish_seen_subcommand_from new' -l ttl -x -a '1h 2h 4h 8h' -d 'Lifetime before AWS terminates it (1m to 8h)'
complete -c mvm -n '__fish_seen_subcommand_from new' -l json -d 'Print the result as JSON'

# mvm rm NAME... [--discard]
complete -c mvm -n '__fish_seen_subcommand_from rm' -a '(__mvm_names_not_yet_listed)' -d machine
complete -c mvm -n '__fish_seen_subcommand_from rm' -l discard -d 'Do not push unpushed work to wip/mvm branches'

# mvm ls|list [--json]
complete -c mvm -n '__fish_seen_subcommand_from ls list' -l json -d 'Print machines as JSON'

# mvm ssh NAME [CMD...]: after NAME comes a remote command, which is not completed.
complete -c mvm -n '__fish_seen_subcommand_from ssh; and __mvm_needs_machine_name' -a '(__mvm_machine_names)' -d machine

# mvm forward NAME [PORT...] [--stop]: PORT offers the machine's own dev server port.
complete -c mvm -n '__fish_seen_subcommand_from forward; and __mvm_needs_machine_name' -a '(__mvm_machine_names)' -d machine
complete -c mvm -n '__fish_seen_subcommand_from forward; and not __mvm_needs_machine_name' -a '(__mvm_dev_server_port (__mvm_positional_args)[1])' -d 'dev server port'
complete -c mvm -n '__fish_seen_subcommand_from forward' -l stop -d "Close all of the machine's forwards"

# mvm tuios NAME
complete -c mvm -n '__fish_seen_subcommand_from tuios; and __mvm_needs_machine_name' -a '(__mvm_machine_names)' -d machine

# mvm logs NAME [-f] [--since 1h]
complete -c mvm -n '__fish_seen_subcommand_from logs; and __mvm_needs_machine_name' -a '(__mvm_machine_names)' -d machine
complete -c mvm -n '__fish_seen_subcommand_from logs' -s f -l follow -d 'Keep printing new lines'
complete -c mvm -n '__fish_seen_subcommand_from logs' -l since -x -a '10m 30m 1h 2h 8h' -d 'How far back (default 1h)'

# mvm secrets push
complete -c mvm -n '__fish_seen_subcommand_from secrets; and not __fish_seen_subcommand_from push' -a push -d 'Copy the dev env vars from this shell (prints names only)'

# mvm image build [--no-wait]
complete -c mvm -n '__fish_seen_subcommand_from image; and not __fish_seen_subcommand_from build' -a build -d 'Build a new image version from image/'
complete -c mvm -n '__fish_seen_subcommand_from image; and __fish_seen_subcommand_from build' -l no-wait -d 'Return once the build started'
