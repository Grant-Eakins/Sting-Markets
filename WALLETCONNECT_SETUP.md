# WalletConnect Setup

The wallet connection button may not work properly without a WalletConnect Project ID.

## Quick Setup (2 minutes)

1. **Go to WalletConnect Cloud**
   - Visit: https://cloud.walletconnect.com/

2. **Sign Up / Sign In**
   - Use GitHub, Google, or email

3. **Create a New Project**
   - Click "Create Project"
   - Name: "Mindshare Prediction Market" (or any name)
   - Click "Create"

4. **Copy Your Project ID**
   - You'll see a Project ID that looks like: `a1b2c3d4e5f6g7h8...`
   - Copy this ID

5. **Update Your `.env` File**
   ```bash
   VITE_WALLETCONNECT_PROJECT_ID=your_actual_project_id_here
   ```

6. **Restart Frontend**
   ```bash
   # Stop the dev server (Ctrl+C)
   npm run dev
   ```

## What If I Skip This?

The app will still work with MetaMask browser extension, but:
- ❌ WalletConnect QR code won't work
- ❌ Mobile wallets won't connect properly
- ❌ Some wallet integrations may fail

With a Project ID:
- ✅ All wallets work perfectly
- ✅ Mobile wallet support
- ✅ WalletConnect v2 features
- ✅ Better user experience

## Alternative: Use MetaMask Extension

If you just want to test quickly:
1. Install MetaMask browser extension
2. Click the wallet button in the app
3. Select MetaMask
4. It should connect without WalletConnect

## Free Forever

WalletConnect's free tier includes:
- Unlimited connections
- All features
- Perfect for development and small apps
