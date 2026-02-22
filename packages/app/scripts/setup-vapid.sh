#!/bin/bash
# Generate VAPID keys for PWA Push Notifications
# Run: bash scripts/setup-vapid.sh

echo "Generating VAPID keys..."
KEYS=$(npx web-push generate-vapid-keys --json 2>/dev/null)

PUBLIC=$(echo "$KEYS" | python3 -c "import sys,json; print(json.load(sys.stdin)['publicKey'])")
PRIVATE=$(echo "$KEYS" | python3 -c "import sys,json; print(json.load(sys.stdin)['privateKey'])")

echo ""
echo "Add these to your .env.local:"
echo ""
echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC"
echo "VAPID_PRIVATE_KEY=$PRIVATE"
echo "VAPID_EMAIL=mailto:admin@qingyi.gg"
echo ""
echo "Done! Restart the dev server after adding these."
