// Popup script for Amazon Price Tracker
let currentTab = null;
let scanResults = [];
let isScanning = false;
let shouldStopScan = false;
let showingHistory = false;

// Extract base ASIN from URL (handles both /dp/ASIN and variant ASINs)
function getBaseAsin(url) {
  // Try to get from twister parameter first (this is the parent ASIN)
  const twisterMatch = url.match(/[?&]th=1[^&]*[?&]psc=1[^&]*(?:.*?)twister[_-]?([A-Z0-9]{10})/i) ||
                       url.match(/twister[_-]?([A-Z0-9]{10})/i);
  if (twisterMatch) {
    console.log(`getBaseAsin: Using twister ASIN (parent): ${twisterMatch[1]}`);
    return twisterMatch[1];
  }

  // Try to get from parent_asin parameter
  const parentMatch = url.match(/[?&]parent[_-]?asin=([A-Z0-9]{10})/i);
  if (parentMatch) {
    console.log(`getBaseAsin: Using parent_asin parameter: ${parentMatch[1]}`);
    return parentMatch[1];
  }

  // Fall back to dp ASIN and normalize across variants
  // For products with variations, the base ASIN is consistent across color variants
  const dpMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (dpMatch) {
    const asin = dpMatch[1];
    console.log(`getBaseAsin: Using dp ASIN: ${asin} (will normalize across variants)`);
    return asin;
  }

  console.log(`getBaseAsin: No ASIN found in URL: ${url}`);
  return null;
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Check if we're on an Amazon product page
  if (!tab.url.includes('amazon.com/')) {
    showStatus('Please navigate to an Amazon product page', 'error');
    document.getElementById('scanBtn').disabled = true;
    return;
  }

  // Check if a scan is currently running
  await checkScanningState();

  // Try to restore last scan results for this page first
  const hasRestoredResults = await restoreLastScanResults();

  // Load current product info
  loadCurrentProduct(hasRestoredResults);

  // Load history for this product
  loadHistory();

  // Set up event listeners
  document.getElementById('scanBtn').addEventListener('click', startScan);
  document.getElementById('stopScanBtn').addEventListener('click', stopScan);
  document.getElementById('viewHistoryBtn').addEventListener('click', showHistory);
  document.getElementById('clearStateBtn').addEventListener('click', clearStuckState);
  document.getElementById('debugStorageBtn').addEventListener('click', debugShowStorage);
});

// Helper function to send message with retry logic
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      // Wait a bit before retrying (content script might still be loading)
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

// Load current product information
async function loadCurrentProduct(skipStatusIfResultsRestored = false) {
  try {
    const response = await sendMessageWithRetry(currentTab.id, {
      action: 'extractCurrentPrice'
    });

    if (response) {
      document.getElementById('productTitle').textContent =
        response.productTitle || 'Unknown Product';
      document.getElementById('currentPrice').textContent =
        response.currentPrice || 'Price not found';

      if (response.currentVariation) {
        document.getElementById('variationName').textContent =
          'Current: ' + response.currentVariation;
      }
    }

    // Check how many variations exist
    const varResponse = await sendMessageWithRetry(currentTab.id, {
      action: 'getVariationCount'
    });

    // Only show variation count status if we didn't restore previous results
    if (varResponse && varResponse.count > 0 && !skipStatusIfResultsRestored) {
      showStatus(`Found ${varResponse.count} variations to scan`, 'info');
    }
  } catch (error) {
    console.error('Error loading product:', error);
    if (!skipStatusIfResultsRestored) {
      showStatus('Please refresh the page and try again', 'error');
    }
  }
}

// Check if a scan is currently running (when popup reopens)
async function checkScanningState() {
  try {
    const asin = getBaseAsin(currentTab.url);
    if (!asin) {
      console.log('checkScanningState: No ASIN found in URL');
      return;
    }

    console.log(`checkScanningState: Checking scan state for base ASIN: ${asin}`);

    const storage = await chrome.storage.local.get('scanningState');
    const scanState = storage.scanningState || {};

    console.log('checkScanningState: Current scan state:', scanState);

    if (scanState[asin] && scanState[asin].isScanning) {
      console.log('checkScanningState: Detected ongoing scan, restoring UI state');
      isScanning = true;

      const scanBtn = document.getElementById('scanBtn');
      const stopBtn = document.getElementById('stopScanBtn');

      scanBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      stopBtn.disabled = false;

      document.getElementById('progress').style.display = 'block';
      document.getElementById('progress').textContent = 'Scan in progress...';
      showStatus('Scan is still running in background', 'info');
    } else {
      console.log(`checkScanningState: No ongoing scan found for ASIN ${asin}`);
      if (scanState[asin]) {
        console.log(`checkScanningState: Scan state exists but isScanning=${scanState[asin].isScanning}`);
      }
    }
  } catch (error) {
    console.error('checkScanningState: Error checking scan state:', error);
  }
}

// Start scanning all variations
async function startScan() {
  // Prevent multiple simultaneous scans
  if (isScanning) {
    showStatus('Scan already in progress. Please wait...', 'info');
    return;
  }

  // Get base ASIN (works across all color variants)
  const asin = getBaseAsin(currentTab.url);

  // Check storage to see if a scan is already running (in case popup was closed/reopened)
  if (asin) {
    const storage = await chrome.storage.local.get('scanningState');
    const scanState = storage.scanningState || {};
    if (scanState[asin] && scanState[asin].isScanning) {
      console.log('startScan: Detected scan already running in storage, blocking new scan');
      showStatus('Scan already in progress. Please wait or stop the current scan.', 'info');
      return;
    }
  }

  isScanning = true;
  shouldStopScan = false;
  showingHistory = false;
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopScanBtn');

  scanBtn.style.display = 'none';
  stopBtn.style.display = 'block';

  document.getElementById('progress').style.display = 'block';
  document.getElementById('progress').textContent = 'Starting scan...';
  document.getElementById('results').innerHTML = '';

  // IMPORTANT: Mark scan as running in storage IMMEDIATELY (synchronously)
  if (asin) {
    console.log(`startScan: Marking scan as running for ASIN: ${asin}`);
    chrome.storage.local.get('scanningState', (storage) => {
      const scanState = storage.scanningState || {};
      scanState[asin] = { isScanning: true, startTime: Date.now() };
      console.log('startScan: About to save scan state:', scanState);
      chrome.storage.local.set({ scanningState: scanState }, () => {
        console.log('startScan: Successfully marked scan as running in storage');
        // Verify it was saved
        chrome.storage.local.get('scanningState', (verify) => {
          console.log('startScan: Verification - storage now contains:', verify.scanningState);
        });
      });
    });
  } else {
    console.error('startScan: No ASIN found, cannot save scan state');
  }

  try {
    const response = await sendMessageWithRetry(currentTab.id, {
      action: 'scanAllVariations'
    });

    if (response.success) {
      scanResults = response.results;
      console.log('startScan: Received scan results:', scanResults);

      // Save to storage
      await saveResults(scanResults);

      // Display results
      displayResults(scanResults);

      showStatus(`Successfully scanned ${response.totalScanned} variations!`, 'success');
    } else {
      showStatus(response.message || 'No variations found', 'error');
    }
  } catch (error) {
    console.error('Scan error:', error);
    console.error('Error details:', error.message, error.stack);
    showStatus(`Error during scan: ${error.message}. Please refresh the page and try again.`, 'error');
  } finally {
    isScanning = false;
    shouldStopScan = false;
    scanBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    document.getElementById('progress').style.display = 'none';

    // Clear scanning state from storage
    if (asin) {
      console.log(`startScan: Clearing scan state for ASIN: ${asin}`);
      chrome.storage.local.get('scanningState', (storage) => {
        const scanState = storage.scanningState || {};
        console.log(`startScan: Current state before clearing:`, scanState);
        delete scanState[asin];
        chrome.storage.local.set({ scanningState: scanState }, () => {
          console.log('startScan: Successfully cleared scan state from storage');
          // Verify it was cleared
          chrome.storage.local.get('scanningState', (verify) => {
            console.log('startScan: Verification after clear:', verify.scanningState);
          });
        });
      });
    }
  }
}

// Clear stuck scanning state (debug button)
async function clearStuckState() {
  try {
    await chrome.storage.local.set({ scanningState: {} });
    console.log('Cleared all scanning states');

    // Reset UI
    isScanning = false;
    document.getElementById('scanBtn').style.display = 'block';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('progress').style.display = 'none';

    showStatus('Cleared stuck state', 'success');
  } catch (error) {
    console.error('Error clearing state:', error);
  }
}

// Debug: Show what's in storage
async function debugShowStorage() {
  try {
    const storage = await chrome.storage.local.get(['priceHistory', 'scanningState']);

    const asin = getBaseAsin(currentTab.url) || 'unknown';

    console.log('=== STORAGE DEBUG ===');
    console.log('Current ASIN:', asin);
    console.log('Scanning State:', storage.scanningState);
    console.log('Price History:', storage.priceHistory);

    if (storage.priceHistory && storage.priceHistory[asin]) {
      console.log(`Data for ${asin}:`, storage.priceHistory[asin]);
      console.log(`Last scan results count:`, storage.priceHistory[asin].lastScanResults?.length || 0);
    } else {
      console.log(`No data found for ASIN ${asin}`);
    }

    alert('Check console for storage contents (Right-click icon → Inspect popup → Console tab)');
  } catch (error) {
    console.error('Error showing storage:', error);
  }
}

// Stop the current scan
async function stopScan() {
  shouldStopScan = true;
  showStatus('Stopping scan...', 'info');
  document.getElementById('stopScanBtn').disabled = true;

  try {
    await sendMessageWithRetry(currentTab.id, {
      action: 'stopScan'
    });

    // Clear scanning state from storage
    const asin = getBaseAsin(currentTab.url);
    if (asin) {
      console.log(`stopScan: Clearing scan state for ASIN: ${asin}`);
      const storage = await chrome.storage.local.get('scanningState');
      const scanState = storage.scanningState || {};
      delete scanState[asin];
      await chrome.storage.local.set({ scanningState: scanState });
      console.log('stopScan: Successfully cleared state from storage');

      // Update UI
      isScanning = false;
      document.getElementById('scanBtn').style.display = 'block';
      document.getElementById('stopScanBtn').style.display = 'none';
      document.getElementById('progress').style.display = 'none';
    }
  } catch (error) {
    console.error('stopScan: Error stopping scan:', error);
  }
}

// Helper function to check if a variation should be filtered out
function shouldFilterVariation(variationName) {
  if (!variationName) return false;

  // Filter out any variation containing sizes other than 14oz
  const patterns = [
    /\b7\s*-?\s*oz\b/i,           // 7oz, 7 oz, 7-oz
    /\b7\.0+\s*oz\b/i,            // 7.0oz, 7.00 oz
    /\bseven\s*oz\b/i,            // seven oz
    /\(7\s*oz\)/i,                // (7oz)
    /7\s*ounce/i,                 // 7 ounce
    /\b(?!14)\d+(?:\.\d+)?\s*-?\s*oz\b/i  // any other size (10oz, 12oz, etc.) but not 14oz
  ];

  const shouldFilter = patterns.some(pattern => pattern.test(variationName));

  if (shouldFilter) {
    console.log(`🚫 POPUP: Filtering out unwanted variation: "${variationName}"`);
  }

  return shouldFilter;
}

// Display scan results
function displayResults(results) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';

  if (!results || results.length === 0) {
    resultsDiv.innerHTML = '<p>No results to display</p>';
    return;
  }

  // FINAL FILTER: Remove any variations that contain unwanted sizes
  results = results.filter(r => !shouldFilterVariation(r.variationName));

  if (results.length === 0) {
    resultsDiv.innerHTML = '<p>No valid results after filtering (all were 7oz or other unwanted sizes)</p>';
    return;
  }

  // Find cheapest
  const prices = results.map(r => {
    const priceStr = r.currentPrice.replace(/[^0-9.]/g, '');
    return parseFloat(priceStr) || 9999999;
  });
  const cheapestPrice = Math.min(...prices);

  // Sort by price
  const sorted = results.sort((a, b) => {
    const priceA = parseFloat(a.currentPrice.replace(/[^0-9.]/g, '')) || 9999999;
    const priceB = parseFloat(b.currentPrice.replace(/[^0-9.]/g, '')) || 9999999;
    return priceA - priceB;
  });

  // Add header with count
  const header = document.createElement('div');
  header.className = 'results-header';
  header.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-size: 13px;">
      <span>📊 ${sorted.length} Variations Found</span>
      <span style="color: #00a854;">Cheapest: ${sorted[0]?.currentPrice || 'N/A'}</span>
    </div>
  `;
  resultsDiv.appendChild(header);

  // Display each variation
  sorted.forEach((result, index) => {
    const price = parseFloat(result.currentPrice.replace(/[^0-9.]/g, '')) || 9999999;
    const isCheapest = price === cheapestPrice;
    const isOutOfStock = result.available === false || result.currentPrice === 'Out of Stock';

    const item = document.createElement('div');
    item.className = 'variation-item' + (isCheapest && !isOutOfStock ? ' cheapest' : '') + (isOutOfStock ? ' out-of-stock' : '');

    item.innerHTML = `
      <div class="variation-name">
        <span style="color: #999; font-size: 11px; margin-right: 5px;">#${index + 1}</span>
        <a href="${result.url}" target="_blank" style="color: inherit; text-decoration: none;" title="Open in new tab">
          ${result.variationName || 'Unknown'}
        </a>
        ${isCheapest && !isOutOfStock ? '<span class="cheapest-badge">CHEAPEST</span>' : ''}
        ${isOutOfStock ? '<span class="out-of-stock-badge">OUT OF STOCK</span>' : ''}
      </div>
      <div class="variation-price">
        ${isOutOfStock ? 'Unavailable' : result.currentPrice}
        ${!isOutOfStock ? '<a href="' + result.url + '" target="_blank" class="buy-link" title="Buy now">🛒</a>' : ''}
      </div>
    `;

    resultsDiv.appendChild(item);
  });
}

// Save results to storage
async function saveResults(results) {
  if (!results || results.length === 0) {
    console.log('saveResults: No results to save');
    return;
  }

  // Try to get base ASIN from results first (contains baseAsin from page)
  let asin = results[0]?.baseAsin;
  console.log(`saveResults: Extracted baseAsin from results[0]: ${asin}`);

  // Fallback to URL parsing
  if (!asin) {
    asin = getBaseAsin(currentTab.url);
    console.log(`saveResults: Fell back to URL-based ASIN: ${asin}`);
  }

  if (!asin) {
    console.error('❌ saveResults: No ASIN found - cannot save!');
    console.error('   Results[0]:', results[0]);
    console.error('   Current URL:', currentTab.url);
    return;
  }

  console.log(`✅ saveResults: Using base ASIN ${asin} for storage key`);

  const timestamp = new Date().toISOString();
  console.log(`saveResults: Saving ${results.length} results for ASIN ${asin}`);

  // Get existing history
  const storage = await chrome.storage.local.get('priceHistory');
  const history = storage.priceHistory || {};

  if (!history[asin]) {
    history[asin] = {
      productTitle: results[0].productTitle,
      scans: []
    };
  }

  // Add this scan
  history[asin].scans.push({
    timestamp: timestamp,
    results: results
  });

  // Keep only last 50 scans per product
  if (history[asin].scans.length > 50) {
    history[asin].scans = history[asin].scans.slice(-50);
  }

  // Also save the last scan results separately for quick restoration
  history[asin].lastScanResults = results;

  await chrome.storage.local.set({ priceHistory: history });
  console.log(`saveResults: Successfully saved ${results.length} results to storage`);

  // Verify the save
  const verify = await chrome.storage.local.get('priceHistory');
  console.log(`saveResults: Verification - stored ${verify.priceHistory[asin]?.lastScanResults?.length || 0} results`);
}

// Restore last scan results when popup opens
async function restoreLastScanResults() {
  try {
    // FIRST, try to get base ASIN from content script (most reliable for variants)
    let asin = null;
    try {
      const response = await sendMessageWithRetry(currentTab.id, {
        action: 'extractCurrentPrice'
      });
      if (response) {
        // Prefer baseAsin (parent product) over asin (variant)
        asin = response.baseAsin || response.asin;
        console.log(`restoreLastScanResults: Got ASIN from content script: ${asin} (baseAsin: ${response.baseAsin}, asin: ${response.asin})`);
      }
    } catch (error) {
      console.log('Could not get ASIN from content script, falling back to URL:', error);
    }

    // Fallback to URL parsing if content script fails
    if (!asin) {
      asin = getBaseAsin(currentTab.url);
    }

    if (!asin) {
      console.log('No ASIN found, cannot restore results');
      return false;
    }

    console.log(`Attempting to restore last scan for base ASIN: ${asin}`);

    const storage = await chrome.storage.local.get('priceHistory');
    const history = storage.priceHistory || {};

    console.log(`restoreLastScanResults: Checking storage for ASIN: ${asin}`);
    console.log(`restoreLastScanResults: Available ASINs in storage:`, Object.keys(history));

    if (history[asin] && history[asin].lastScanResults && history[asin].lastScanResults.length > 0) {
      scanResults = history[asin].lastScanResults;
      console.log(`✅ Restored ${scanResults.length} scan results from storage for ASIN ${asin}`);

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        displayResults(scanResults);
        showStatus(`Last scan: ${scanResults.length} variations found`, 'success');
      }, 100);

      return true; // Indicate that results were restored
    } else {
      if (!history[asin]) {
        console.log(`❌ No history entry found for ASIN: ${asin}`);
      } else if (!history[asin].lastScanResults) {
        console.log(`❌ History entry exists for ${asin} but no lastScanResults`);
      } else if (history[asin].lastScanResults.length === 0) {
        console.log(`❌ lastScanResults exists for ${asin} but is empty`);
      }
      return false; // No results restored
    }
  } catch (error) {
    console.error('Error restoring last scan:', error);
    return false; // Failed to restore
  }
}

// Load and display history
async function loadHistory() {
  try {
    // Use base ASIN to get consistent history across color variants
    const asin = getBaseAsin(currentTab.url);

    if (!asin) {
      console.log('No ASIN found for history');
      return;
    }

    console.log(`Loading history for base ASIN: ${asin}`);

    const storage = await chrome.storage.local.get('priceHistory');
    const history = storage.priceHistory || {};

    if (history[asin] && history[asin].scans.length > 0) {
      const lastScan = history[asin].scans[history[asin].scans.length - 1];
      const scanDate = new Date(lastScan.timestamp).toLocaleDateString();

      document.getElementById('viewHistoryBtn').textContent =
        `📊 View Price History (${history[asin].scans.length} scans)`;

      console.log(`Found ${history[asin].scans.length} scans in history`);
    } else {
      console.log('No history found for this product');
    }
  } catch (error) {
    console.error('Error loading history:', error);
    // Silent fail for history loading - not critical
  }
}

// Show price history
async function showHistory() {
  // Toggle history view
  if (showingHistory) {
    // If showing history, go back to showing last scan results
    if (scanResults && scanResults.length > 0) {
      displayResults(scanResults);
      showingHistory = false;
      document.getElementById('viewHistoryBtn').textContent = '📊 View Price History';
    } else {
      document.getElementById('results').innerHTML = '';
      showingHistory = false;
      document.getElementById('viewHistoryBtn').textContent = '📊 View Price History';
    }
    return;
  }

  try {
    // Use base ASIN to get consistent history across color variants
    const asin = getBaseAsin(currentTab.url);

    if (!asin) {
      showStatus('Cannot load history for this product', 'error');
      return;
    }

    const storage = await chrome.storage.local.get('priceHistory');
    const history = storage.priceHistory || {};

    if (!history[asin] || history[asin].scans.length === 0) {
      showStatus('No history available yet. Run a scan first!', 'info');
      return;
    }

    // Display history
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<h3 style="margin-top: 0;">Price History</h3>';

    // Clone the scans array before reversing to avoid mutating stored data
    const scans = [...history[asin].scans].reverse();

    scans.forEach((scan, index) => {
      const scanDate = new Date(scan.timestamp).toLocaleString();

      // Find cheapest item from the scan
      const cheapest = [...scan.results].sort((a, b) => {
        const priceA = parseFloat(a.currentPrice.replace(/[^0-9.]/g, '')) || 9999999;
        const priceB = parseFloat(b.currentPrice.replace(/[^0-9.]/g, '')) || 9999999;
        return priceA - priceB;
      })[0];

      const historyItem = document.createElement('div');
      historyItem.className = 'variation-item';
      historyItem.style.cursor = 'pointer';
      historyItem.title = 'Click to view full scan details';

      historyItem.innerHTML = `
        <div class="variation-name">
          <strong>${scanDate}</strong><br>
          <small>${scan.results.length} variations scanned</small><br>
          <small style="color: #00a854;">Cheapest: ${cheapest.variationName} - ${cheapest.currentPrice}</small>
        </div>
        <div style="color: #007185; font-size: 12px;">View Details →</div>
      `;

      // Make it clickable to show the full scan data
      historyItem.addEventListener('click', () => {
        displayResults(scan.results);
        scanResults = scan.results; // Update current results
        showingHistory = false;
        document.getElementById('viewHistoryBtn').textContent = '📊 View Price History';
        showStatus(`Viewing scan from ${scanDate}`, 'info');
      });

      resultsDiv.appendChild(historyItem);
    });

    showingHistory = true;
    document.getElementById('viewHistoryBtn').textContent = '◀ Back to Results';
  } catch (error) {
    console.error('Error showing history:', error);
    showStatus('Error loading history. Please try again.', 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
}

// Listen for progress updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Popup received message:', request);
  if (request.type === 'scanProgress') {
    const progressText = `Scanning color ${request.current} of ${request.total}...`;
    console.log('Updating progress:', progressText);
    const progressEl = document.getElementById('progress');
    if (progressEl) {
      progressEl.style.display = 'block';
      progressEl.textContent = progressText;
      console.log('Progress element updated successfully');
    } else {
      console.error('Progress element not found!');
    }
  }
});
