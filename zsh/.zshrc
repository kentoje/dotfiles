export ZSH="/Users/kento/.oh-my-zsh"

plugins=(git)

# Loads all files in ~/.zshrc.d
for config_file (/Users/kento/.zshrc.d/*.zsh)
  do
  source $config_file
done

