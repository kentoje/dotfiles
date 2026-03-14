# You will need to configure AWS accounts with sso in order to use this script. `aws configure sso`
function get_aws_credentials
    # List AWS profiles, remove "default" and check if any exist
    set -l available_profiles (aws configure list-profiles | grep -v "default")
    
    if test -z "$available_profiles"
        echo "No AWS profiles available. Run 'aws configure sso` to set up SSO."
        return 1
    end
    
    # Select a profile using fzf
    set -l selected_profile (aws configure list-profiles | grep -v "default" | fzf)
    
    if test -z "$selected_profile"
        echo "No profile selected"
        return 1
    end
    
    # Export credentials for the selected profile and parse with jq
    set -l credentials_json (aws configure export-credentials --profile $selected_profile 2>&1 | string collect)
    
    # If output is not valid JSON, assume SSO token issue and login
    if not echo "$credentials_json" | jq -e . >/dev/null 2>&1
        echo "SSO token expired or invalid. Logging in..."
        aws sso login --profile $selected_profile
        set credentials_json (aws configure export-credentials --profile $selected_profile 2>&1 | string collect)
        if not echo "$credentials_json" | jq -e . >/dev/null 2>&1
            echo "Failed to get credentials: $credentials_json"
            return 1
        end
    end

    # Extract credentials
    set -l access_key_id (echo "$credentials_json" | jq -r '.AccessKeyId')
    set -l secret_access_key (echo "$credentials_json" | jq -r '.SecretAccessKey')
    set -l session_token (echo "$credentials_json" | jq -r '.SessionToken')
    
    # Check for .env or .env.local files
    set -l env_file
    if test -f .env
        set env_file .env
    else if test -f .env.local
        set env_file .env.local
    end
    
    if test -n "$env_file"
        # Remove existing AWS credentials from env file
        sed -i '' '/^AWS_ACCESS_KEY_ID=/d' $env_file
        sed -i '' '/^AWS_SECRET_ACCESS_KEY=/d' $env_file
        sed -i '' '/^AWS_SESSION_TOKEN=/d' $env_file
        
        # Append new credentials
        echo "AWS_ACCESS_KEY_ID=$access_key_id" >> $env_file
        echo "AWS_SECRET_ACCESS_KEY=$secret_access_key" >> $env_file
        echo "AWS_SESSION_TOKEN=$session_token" >> $env_file
        
        echo "AWS credentials updated in $env_file for profile: '$selected_profile'"
    else
        # Set fish variables if no env file exists
        set -gx AWS_ACCESS_KEY_ID $access_key_id
        set -gx AWS_SECRET_ACCESS_KEY $secret_access_key
        set -gx AWS_SESSION_TOKEN $session_token
        
        echo "AWS credentials set as fish variables for profile: '$selected_profile'"
    end
end

# aws configure list-profiles
# aws configure sso
# aws sso login --profile <PROFILE>
# aws configure export-credentials --profile <PROFILE>

