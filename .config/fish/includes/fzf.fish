set -Ux FZF_DEFAULT_OPTS "\
--reverse \
--border none \
--no-info \
--pointer='' \
--marker=' ' \
--ansi \
--bind 'alt-a:toggle-all' \
--color='16,bg+:-1,gutter:-1,prompt:5,pointer:5,marker:6,border:4,label:4,header:italic'"
set -Ux FZF_CTRL_R_OPTS "--border-label=' history ' \
--prompt='  '"
set -U FZF_CTRL_R_OPTS "--reverse"
set -U FZF_TMUX_OPTS "-p"

