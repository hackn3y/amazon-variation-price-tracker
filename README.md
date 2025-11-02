# Amazon Variation Price Tracker

A Chrome extension that automatically scans all color/size variations on Amazon product pages to help you find the best deal. It also tracks price history over time so you can spot sales and price drops.

## Features

- 🔍 **Automatic Scanning**: Click one button to scan all variations on a product page
- 💰 **Find Cheapest**: Automatically highlights the lowest-priced variation
- 📊 **Price History**: Tracks prices over time to help you spot sales
- 🎯 **Simple Interface**: Clean, easy-to-use popup interface
- 💾 **Local Storage**: All data stored locally on your computer

## Installation

### Step 1: Download the Extension
1. Download all files in this folder
2. Keep them together in a folder called `amazon-price-tracker`

### Step 2: Load into Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked"
4. Select the `amazon-price-tracker` folder
5. The extension icon should now appear in your Chrome toolbar

### Step 3: Pin the Extension (Optional)
1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Amazon Variation Price Tracker"
3. Click the pin icon to keep it visible

## How to Use

### Scanning Product Variations

1. **Navigate to any Amazon product page** with multiple color/size options
   - Example: https://www.amazon.com/dp/B0CXCTSMJH

2. **Click the extension icon** in your Chrome toolbar

3. **Click "🔍 Scan All Variations"**
   - The extension will automatically click through each variation
   - Prices will be collected and displayed
   - The cheapest option will be highlighted in green

4. **Review the results**
   - All variations are sorted by price (lowest to highest)
   - The cheapest option is marked with a "CHEAPEST" badge

### Viewing Price History

1. After scanning a product at least once, click **"📊 View Price History"**
2. You'll see:
   - Date and time of each scan
   - The cheapest variation from each scan
   - Price at that time

This helps you:
- Track if prices are going up or down
- Spot sales and discounts
- Decide when to buy

### Tips for Best Results

- **Wait for page to fully load** before scanning
- **Let the scan complete** - don't close the popup or navigate away
- **Scan regularly** to build up price history (weekly or monthly)
- **Check back during sales events** (Prime Day, Black Friday) to compare prices

## How It Works

The extension:
1. Detects all variation options (colors, sizes, etc.) on the page
2. Clicks through each one automatically
3. Extracts the price for each variation
4. Saves the data locally in Chrome's storage
5. Displays results sorted by price

## Privacy & Data

- ✅ All data is stored **locally** on your computer
- ✅ **No data is sent** to external servers
- ✅ Only works on **Amazon.com** pages
- ✅ No tracking or analytics

## Troubleshooting

### "No variations found"
- Make sure you're on a product page with multiple color/size options
- Try refreshing the page and scanning again
- Some products use different layouts that may not be detected

### Prices not updating
- Wait a few seconds between clicks
- Try manually clicking a variation first, then run the scan
- Clear the extension data and try again

### Extension not working
1. Make sure you're on `amazon.com` (not `.ca`, `.uk`, etc.)
2. Try refreshing the page
3. Reload the extension in `chrome://extensions/`

## Future Improvements

Potential features to add:
- [ ] Support for Amazon international sites (.ca, .uk, .de, etc.)
- [ ] Price drop notifications
- [ ] Export data to CSV
- [ ] Track multiple products at once
- [ ] Price charts and graphs
- [ ] Comparison across different products

## Technical Details

**Built with:**
- Manifest V3 (latest Chrome extension format)
- Vanilla JavaScript (no frameworks needed)
- Chrome Storage API for data persistence
- Content Scripts for page interaction

**Files:**
- `manifest.json` - Extension configuration
- `content.js` - Interacts with Amazon pages
- `popup.html` - User interface
- `popup.js` - UI logic and data management
- `icon16.png`, `icon48.png`, `icon128.png` - Extension icons

## Development

Want to modify or improve the extension?

### Testing Changes
1. Make your changes to the code
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test on an Amazon product page

### Debugging
- Right-click the extension icon → "Inspect popup" to debug popup code
- Press F12 on Amazon page → Console tab to see content script logs

## License

Free to use and modify for personal use. This is a portfolio/learning project.

## Credits

Created as a practical tool for finding the best deals on Amazon products and tracking price changes over time.

---

**Note**: This extension is not affiliated with or endorsed by Amazon.com, Inc. or its affiliates. It's an independent tool created to help shoppers compare prices.
