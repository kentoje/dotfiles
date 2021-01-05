# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

# Path to your oh-my-zsh installation.
export ZSH="/home/kento/.oh-my-zsh"

ZSH_THEME="robbyrussell"

# Plugins
plugins=(
	git
	zsh-autosuggestions
	zsh-syntax-highlighting
)

source $ZSH/oh-my-zsh.sh

# Aliases
alias pbcopy="xsel --clipboard --input"
alias pbpaste="xsel --clipboard --output"

source /usr/share/nvm/init-nvm.sh

# Pure theme
zstyle :prompt:pure:git:branch color "#FF6AC1"
PURE_PROMPT_SYMBOL="🧋"
fpath+=$HOME/.zsh/pure
autoload -U promptinit; promptinit
prompt pure

# Startup

# Silent the output, wherever it is an error or not.
# imwheel -k -b 45 > /dev/null 2>&1

# ssh-agent
eval "$(ssh-agent)" > /dev/null 2>&1

