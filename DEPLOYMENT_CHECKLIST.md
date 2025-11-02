# Chrome Web Store Deployment Checklist

## ✅ Completed

- [x] Extension code is working and tested
- [x] Manifest.json updated with proper metadata (v1.0.0)
- [x] Privacy policy created (PRIVACY.html)
- [x] Store listing information prepared (STORE_LISTING.md)
- [x] README enhanced with installation instructions
- [x] Deployment ZIP package created: `amazon-price-tracker-v1.0.0.zip`
- [x] Code pushed to GitHub
- [x] Purchase links feature implemented

## 📋 Next Steps (Manual)

### 1. Create Developer Account
- [ ] Go to https://chrome.google.com/webstore/devconsole
- [ ] Sign in with your Google account
- [ ] Pay $5 one-time registration fee
- [ ] Select **"Non-trader account"** (since not monetized)

### 2. Take Screenshots
You need 1-5 screenshots (1280x800 or 640x400 pixels):

**Required Screenshots:**
1. Extension popup showing "Scan All Variations" button on Amazon page
2. Scan in progress with progress indicator
3. Results showing sorted variations with cheapest highlighted
4. Purchase links visible (🛒 buttons)

**How to take screenshots:**
1. Navigate to: https://www.amazon.com/dp/B0CXCTSMJH (or any product with variations)
2. Click extension icon
3. Run a scan
4. Use Snipping Tool or screenshot tool to capture at 1280x800
5. Save as PNG or JPG

### 3. Upload to Chrome Web Store

**Go to:** https://chrome.google.com/webstore/devconsole

**Upload Package:**
- [ ] Click "New Item"
- [ ] Upload: `amazon-price-tracker-v1.0.0.zip` (in this folder)

**Fill Store Listing** (copy from STORE_LISTING.md):
- [ ] **Product Details**
  - Name: `Amazon Variation Price Tracker`
  - Summary: (see STORE_LISTING.md)
  - Description: (copy full description from STORE_LISTING.md)
  - Category: Shopping
  - Language: English (United States)

- [ ] **Privacy**
  - Single Purpose: (copy from STORE_LISTING.md)
  - Permission Justifications: (copy from STORE_LISTING.md)
  - Privacy Policy URL:
    ```
    https://htmlpreview.github.io/?https://github.com/hackn3y/amazon-variation-price-tracker/blob/master/PRIVACY.html
    ```
    OR (if you enable GitHub Pages):
    ```
    https://hackn3y.github.io/amazon-variation-price-tracker/PRIVACY.html
    ```

- [ ] **Store Listing**
  - Upload screenshots (1-5 images)
  - Optional: Small tile icon (440x280 px)

- [ ] **Distribution**
  - Select "Public" (or "Unlisted" if you prefer)

### 4. Submit for Review
- [ ] Review all information
- [ ] Click "Submit for Review"
- [ ] Wait 1-3 business days for Google review
- [ ] Check email for approval/rejection notice

### 5. After Approval

- [ ] Get your extension URL from Chrome Web Store
- [ ] Update README.md badges (uncomment the section at top)
- [ ] Replace `YOUR_EXTENSION_ID` with actual ID
- [ ] Share the Chrome Web Store link

---

## 🎯 Quick Reference

**Files Location:**
- Deployment ZIP: `amazon-price-tracker-v1.0.0.zip`
- Privacy Policy: `PRIVACY.html`
- Store Info: `STORE_LISTING.md`

**Privacy Policy URLs** (choose one):
```
Option 1: https://htmlpreview.github.io/?https://github.com/hackn3y/amazon-variation-price-tracker/blob/master/PRIVACY.html

Option 2 (GitHub Pages): https://hackn3y.github.io/amazon-variation-price-tracker/PRIVACY.html
```

To enable GitHub Pages (for Option 2):
1. Go to GitHub repo settings
2. Pages → Source → Deploy from branch: master
3. Select folder: / (root)
4. Save

**Support/Homepage URLs:**
```
Homepage: https://github.com/hackn3y/amazon-variation-price-tracker
Support: https://github.com/hackn3y/amazon-variation-price-tracker/issues
```

---

## 💡 Tips

1. **Test First**: Load the extension from the ZIP in Chrome to verify it works
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked" and select the extracted ZIP contents
   - Test on Amazon product page

2. **Screenshot Quality**: Make sure screenshots are clear and show the extension's value
   - Show actual price differences (e.g., $19.99 vs $24.99)
   - Highlight the "CHEAPEST" badge
   - Show the purchase links (🛒)

3. **Description**: The store description should be compelling
   - Focus on saving money
   - Emphasize ease of use
   - Mention speed (1 minute for 24 variations)

4. **Response Time**: Google typically reviews within 1-3 days
   - Check email regularly
   - Respond quickly if they have questions

5. **After Publication**:
   - Monitor reviews and ratings
   - Respond to user feedback
   - Push updates for bugs/features (each needs review)

---

## ❓ Common Rejection Reasons

1. **Privacy Policy Not Accessible**: Make sure the URL works in incognito mode
2. **Permissions Not Justified**: Clearly explain each permission in the form
3. **Misleading Description**: Don't oversell or make false claims
4. **Poor Screenshots**: Need at least 1 clear screenshot
5. **Single Purpose Not Clear**: Clearly state the one thing the extension does

---

## 🚀 You're Ready!

Everything is prepared. Just need to:
1. Create screenshots
2. Register developer account ($5)
3. Upload and fill out the form (use STORE_LISTING.md)
4. Submit for review

Good luck! 🎉
