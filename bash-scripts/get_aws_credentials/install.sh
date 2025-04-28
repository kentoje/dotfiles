#!/bin/bash

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status messages
print_status() {
    echo -e "\n\033[1m$1\033[0m"
}

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "This script is designed for macOS only."
    exit 1
fi

# Install AWS CLI
print_status "Installing AWS CLI..."
if ! command_exists aws; then
    curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
    sudo installer -pkg AWSCLIV2.pkg -target /
    rm AWSCLIV2.pkg
    echo "AWS CLI installed successfully."
else
    echo "AWS CLI is already installed."
fi

# Check if Homebrew is installed
if ! command_exists brew; then
    print_status "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install fzf
print_status "Installing fzf..."
if ! command_exists fzf; then
    brew install fzf
    echo "fzf installed successfully."
else
    echo "fzf is already installed."
fi

# Install jq
print_status "Installing jq..."
if ! command_exists jq; then
    brew install jq
    echo "jq installed successfully."
else
    echo "jq is already installed."
fi

print_status "Installation complete!"
echo "To use the AWS credentials script, source it in your shell:"
echo "source bash-scripts/get_aws_credentials.sh" 