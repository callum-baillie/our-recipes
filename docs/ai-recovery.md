# Assistant recovery and approval

When the assistant needs a disabled sharing category, its `request_ai_access` tool creates a human approval card. The tool cannot grant itself access. Another account’s private data requires that account owner’s approval; an administrator can approve a household profile without a linked account. Requests are visible in the assistant and **Account → AI**. Switching the viewed profile does not confer approval authority.

**Allow once** applies only to the approved account, conversation, data categories and next explicit reply. It does not change saved settings or authorize background jobs. Pending requests and one-time grants expire after fifteen minutes. An owner can revoke a one-time grant, including during a running reply; this stops further use, but cannot recall information already sent to the provider. Changes to sharing settings or account ownership invalidate outstanding grants. Continuing a conversation whose private history is no longer shared requires renewed approval or a new conversation.

**Always allow** updates only the requested sharing categories. The card explains that these settings apply to permitted household AI requests until sharing is turned off. Approval never sends a new chat request automatically: the requesting account must select **Continue request**.

Administrators can approve a higher request allowance, output-token limit, response deadline or tool-round limit for one reply, or update the household setting permanently. Supported hard bounds remain enforced. Consent does not bypass authentication, account roles, disabled AI, provider quota or provider model restrictions. Provider failures that have no application override give a safe explanation and a settings link instead.

The request allowance also raises the chat-start throttle when it exceeds the baseline of twenty replies per ten minutes. Provider requests and chat starts have separate usage counters; errors identify the counter that was reached.

Chat errors stay visible with a friendly explanation, relevant recovery actions and copyable technical details. Diagnostics include a reference, safe error code, time and configured limits; allowance errors also include usage counts. The matching reference is logged server-side. Provider bodies, credentials, prompts and stacks are excluded. Error notifications have a copy button and a manual-copy fallback when browser clipboard access is unavailable.

Recovery decisions require an authenticated account, exact trusted mutation origin and current server-side authority. One-time grants are claimed transactionally for an idempotent turn and checked again at provider/tool boundaries. A failed preflight that never reached a provider preserves its approval; a running or provider-sent turn does not refund it.
