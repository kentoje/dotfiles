# You will need to configure AWS accounts with sso in order to use this script. `aws configure sso`
function get_aws_credentials
    # List AWS profiles, remove "default" and check if any exist
    set -l available_profiles (aws configure list-profiles | grep -v "default")
    
    if test -z "$available_profiles"
        echo "No AWS profiles available. Run 'aws configure sso` to set up SSO."
        return 1
    end
    
    # Select a profile using fzf
    set -l selected_profile (echo $available_profiles | fzf)
    
    if test -z "$selected_profile"
        echo "No profile selected"
        return 1
    end
    
    # Export credentials for the selected profile and parse with jq
    set -l credentials_json (aws configure export-credentials --profile $selected_profile 2>&1)
    
    # Check for SSO token error
    if string match -q "*Error loading SSO Token*" $credentials_json
        echo "SSO token expired or invalid. Logging in..."
        aws sso login --profile $selected_profile
        # Try getting credentials again after login
        set credentials_json (aws configure export-credentials --profile $selected_profile)
    end
    
    # Set each credential individually
    set -gx AWS_ACCESS_KEY_ID (echo $credentials_json | jq -r '.AccessKeyId')
    set -gx AWS_SECRET_ACCESS_KEY (echo $credentials_json | jq -r '.SecretAccessKey')
    set -gx AWS_SESSION_TOKEN (echo $credentials_json | jq -r '.SessionToken')
    
    echo "AWS credentials set for profile: '$selected_profile'"
end

# aws configure list-profiles
# aws configure sso
# aws sso login --profile <PROFILE>
# aws configure export-credentials --profile <PROFILE>

