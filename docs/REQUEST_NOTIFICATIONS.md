# Wallet request notifications

The bell beside the wallet shows a red badge for requests waiting on that wallet. Opening the list, dismissing an alert, or choosing **Not now** leaves the request pending. Approval, withdrawal, expiry and changed controller state remove the corresponding action.

Sign in through **Notifications → Sign in to requests**, or through the licensing workspace. Both share one in-memory authenticated session. Sign-in does not approve requests or move funds. A wallet/network change clears the session and any open approval. Sessions expire after 30 minutes; the bell asks for sign-in again. No token is written to browser storage.

The active deployment inbox is checked every five seconds while the page is visible, immediately after local changes, and when the page regains focus. New requests animate the bell and display an actionable tooltip for eight seconds. Loading an existing inbox is quiet, repeat polls do not repeat alerts, and reduced-motion preferences disable the animation. The badge counts waiting actions, not unread messages.

Reference flow:

1. In Mint Studio, prepare a reference to an existing Brick and choose **Send to controller inbox**. Sign in if needed. Requester and target controller are verified; only the scope, public work labels and reference identities go to the deployment ledger.
2. The controller receives a notification and opens the existing approval modal from the bell. Approval still requires a wallet signature for that exact request.
3. The signed answer is returned to the requesting wallet and picked up by its open mint form. Mint preflight verifies the current controller and signature again. Source files and private recovery keys never enter this inbox.

Same-wallet requests and manually pasted requests also appear in the bell during the browser session. Cross-wallet delivery requires both users to use the same deployment inbox. JSON exchange remains available for other deployments and contract-wallet workflows. Sent pending requests must be withdrawn before editing their scope; a completed signature remains cryptographic evidence of the scope it authorized.

License offers awaiting controller approval and approved offers/counters awaiting licensee acceptance share the list. Selecting one opens its review modal, with the existing approval, counter-offer and payment controls. Payment still goes directly to the Brick.
