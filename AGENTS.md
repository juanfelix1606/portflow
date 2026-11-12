# Portflow development guidelines

- Use fictional demonstration data only. Do not add company-confidential information, credentials, or proprietary workflows.
- Keep backend business rules authoritative; frontend checks are for user experience only.
- Validate API inputs and preserve transaction safety for multi-record operations.
- Never return password hashes; audit administrative user changes and preserve at least one active administrator.
- Keep changes within the current milestone and run the relevant validation commands before reporting completion.
- Never add AI co-author trailers or artificial contributor credits to Git commits.
