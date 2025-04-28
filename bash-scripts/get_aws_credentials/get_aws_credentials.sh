#!/bin/bash

# You will need to configure AWS accounts with sso in order to use this script. `aws configure sso`
function get_aws_credentials {
  # List AWS profiles, remove "default" and check if any exist
  local available_profiles=$(aws configure list-profiles | grep -v "default")

  if [ -z "$available_profiles" ]; then
    echo "No AWS profiles available. Run 'aws configure sso' to set up SSO."
    return 1
  fi

  # Select a profile using fzf
  local selected_profile=$(aws configure list-profiles | grep -v "default" | fzf)

  if [ -z "$selected_profile" ]; then
    echo "No profile selected"
    return 1
  fi

  # Export credentials for the selected profile and parse with jq
  local credentials_json=$(aws configure export-credentials --profile "$selected_profile" 2>&1)

  # Check for SSO token error
  if [[ "$credentials_json" == *"Error loading SSO Token"* ]] || [[ "$credentials_json" == *"The SSO session associated with this profile has expired or is otherwise invalid"* ]]; then
    echo "SSO token expired or invalid. Logging in..."
    aws sso login --profile "$selected_profile"
    # Try getting credentials again after login
    credentials_json=$(aws configure export-credentials --profile "$selected_profile")
  fi

  # Extract credentials
  local access_key_id=$(echo "$credentials_json" | jq -r '.AccessKeyId')
  local secret_access_key=$(echo "$credentials_json" | jq -r '.SecretAccessKey')
  local session_token=$(echo "$credentials_json" | jq -r '.SessionToken')

  # Check for .env or .env.local files
  local env_file
  if [ -f .env ]; then
    env_file=".env"
  elif [ -f .env.local ]; then
    env_file=".env.local"
  fi

  if [ -n "$env_file" ]; then
    # Remove existing AWS credentials from env file
    sed -i '' '/^AWS_ACCESS_KEY_ID=/d' "$env_file"
    sed -i '' '/^AWS_SECRET_ACCESS_KEY=/d' "$env_file"
    sed -i '' '/^AWS_SESSION_TOKEN=/d' "$env_file"

    # Append new credentials
    echo "AWS_ACCESS_KEY_ID=$access_key_id" >>"$env_file"
    echo "AWS_SECRET_ACCESS_KEY=$secret_access_key" >>"$env_file"
    echo "AWS_SESSION_TOKEN=$session_token" >>"$env_file"

    echo "AWS credentials updated in $env_file for profile: '$selected_profile'"
  else
    # Set environment variables if no env file exists
    export AWS_ACCESS_KEY_ID="$access_key_id"
    export AWS_SECRET_ACCESS_KEY="$secret_access_key"
    export AWS_SESSION_TOKEN="$session_token"

    echo "AWS credentials set as environment variables for profile: '$selected_profile'"
  fi
}

# Make the function available in the current shell
export -f get_aws_credentials

# Check if the script is being sourced or run directly
# $0 is the name of the script when run directly, or the name of the shell when sourced
# ${BASH_SOURCE[0]} is always the name of the script
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  # Script is being run directly
  get_aws_credentials
fi
