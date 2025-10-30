// Content script for Amazon price tracking
console.log('Amazon Price Tracker: Content script loaded');

// Global flag to control scan stopping
let shouldStopScan = false;

// Function to extract current product data
function extractProductData() {
  const data = {
    productTitle: '',
    currentPrice: '',
    currentVariation: '',
    timestamp: new Date().toISOString(),
    url: window.location.href,
    asin: ''
  };

  // Extract current variant ASIN from URL first
  const dpMatch = window.location.href.match(/\/dp\/([A-Z0-9]{10})/);
  if (dpMatch) {
    data.asin = dpMatch[1];
  }

  // Extract base/parent ASIN - try multiple methods
  // Method 1: Check for twister/parent ASIN in URL (most reliable for variants)
  const twisterMatch = window.location.href.match(/twister[_-]?([A-Z0-9]{10})/i);
  if (twisterMatch) {
    data.baseAsin = twisterMatch[1];
  }

  // Method 2: Look for parent ASIN in page metadata
  if (!data.baseAsin) {
    // Try window.ue_pti (Amazon's page metadata)
    if (window.ue_pti && typeof window.ue_pti === 'string') {
      const ptiMatch = window.ue_pti.match(/^[A-Z0-9]{10}$/);
      if (ptiMatch) {
        data.baseAsin = window.ue_pti;
        console.log(`Found baseAsin from ue_pti: ${data.baseAsin}`);
      }
    }
  }

  // Method 3: Try data-parent-asin attribute
  if (!data.baseAsin) {
    const parentAsinEl = document.querySelector('[data-parent-asin]');
    if (parentAsinEl) {
      const parentAsin = parentAsinEl.getAttribute('data-parent-asin');
      if (parentAsin && parentAsin.match(/^[A-Z0-9]{10}$/)) {
        data.baseAsin = parentAsin;
        console.log(`Found baseAsin from data-parent-asin: ${data.baseAsin}`);
      }
    }
  }

  // Method 4: Check for canonical link (often contains parent ASIN)
  if (!data.baseAsin) {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const canonicalMatch = canonical.href.match(/\/dp\/([A-Z0-9]{10})/);
      if (canonicalMatch) {
        data.baseAsin = canonicalMatch[1];
        console.log(`Found baseAsin from canonical link: ${data.baseAsin}`);
      }
    }
  }

  // Method 5: If still no baseAsin, use the variant ASIN (better than nothing)
  if (!data.baseAsin && data.asin) {
    data.baseAsin = data.asin;
    console.log(`Using variant ASIN as baseAsin: ${data.baseAsin}`);
  }

  // Extract product title
  const titleElement = document.querySelector('#productTitle, #title');
  if (titleElement) {
    data.productTitle = titleElement.textContent.trim();
  }

  // Extract current price - prioritize buying box price which updates more reliably
  const priceSelectors = [
    // Buying box prices (most reliable, updates quickly) - be more specific to avoid size variation prices
    // Try offscreen first as it has the full formatted price
    '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
    '#corePrice_desktop .a-price .a-offscreen',
    // Price to pay (often most accurate for selected variation)
    '.priceToPay .a-offscreen',
    '#apex_desktop .a-price .a-offscreen',
    // Price from the buy box area
    '#buybox .a-price .a-offscreen',
    // Specific buybox selectors
    '[data-csa-c-content-id="price-inside-buybox"] .a-offscreen',
    '#apex_desktop_newAccordionRow .a-price .a-offscreen',
    // General price selectors
    '#corePrice_feature_div .a-price .a-offscreen',
    '#price_inside_buybox',
    '#priceblock_ourprice',
    '#priceblock_dealprice'
  ];

  for (const selector of priceSelectors) {
    // Get all matching elements to check for multiple prices
    const priceElements = document.querySelectorAll(selector);

    for (const priceElement of priceElements) {
      const priceText = priceElement.textContent.trim();

      // Skip if this looks like a size variation label price (not the main price)
      const parentElement = priceElement.closest('[id*="variation"], [class*="variation"]');
      if (parentElement) {
        console.log(`Skipping price from variation container: ${priceText} (parent: ${parentElement.id || parentElement.className})`);
        continue;
      }

      // Skip if the price element itself is inside a twister variation swatch
      if (priceElement.closest('li[data-defaultasin]')) {
        console.log(`Skipping price from swatch element: ${priceText}`);
        continue;
      }

      // Skip if it's inside a twister dimension value element
      if (priceElement.closest('.twister-plus-buying-options-price-data')) {
        console.log(`Skipping price from twister dimension: ${priceText}`);
        continue;
      }

      // Validate the price format - must contain cents (e.g., $39.99 not just $25)
      // If it doesn't have cents, try to find the complete price nearby
      if (priceText && !priceText.includes('.')) {
        console.log(`Price "${priceText}" missing cents, looking for .a-offscreen sibling...`);
        const parent = priceElement.closest('.a-price');
        if (parent) {
          const offscreenPrice = parent.querySelector('.a-offscreen');
          if (offscreenPrice) {
            const fullPrice = offscreenPrice.textContent.trim();
            console.log(`Found complete price with cents: ${fullPrice}`);
            data.currentPrice = fullPrice;
            break;
          }
        }
        // If we can't find the full price, skip this element
        console.log(`Skipping incomplete price: ${priceText}`);
        continue;
      }

      console.log(`Found price with selector "${selector}": ${priceText}`);
      data.currentPrice = priceText;
      break;
    }

    // If we found a price, stop searching
    if (data.currentPrice && data.currentPrice !== '') {
      break;
    }
  }

  // Fallback 1: Try to extract price from desktop_buybox_group data if no price found
  if (!data.currentPrice || data.currentPrice === '') {
    console.log('No price found with selectors, trying JSON fallback...');
    try {
      const scripts = document.querySelectorAll('script[type="text/javascript"]');
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes('desktop_buybox_group')) {
          // Look for displayPrice in the JSON
          const priceMatch = content.match(/"displayPrice"\s*:\s*"([^"]+)"/);
          if (priceMatch) {
            console.log(`Found price in buybox JSON: ${priceMatch[1]}`);
            data.currentPrice = priceMatch[1];
            break;
          }
        }
      }
    } catch (error) {
      console.log('Could not extract price from buybox data:', error);
    }
  }

  // Fallback 2: Look for any price-looking text in common price containers
  if (!data.currentPrice || data.currentPrice === '') {
    console.log('Trying aggressive price search...');
    const priceContainers = document.querySelectorAll('[class*="price"], [id*="price"]');
    for (const container of priceContainers) {
      // Skip variation price containers
      if (container.id.includes('variation') || container.closest('[id*="variation"]')) {
        continue;
      }

      // Look for dollar amounts
      const priceMatch = container.textContent.match(/\$\d+\.\d{2}/);
      if (priceMatch) {
        console.log(`Found price with aggressive search: ${priceMatch[0]}`);
        data.currentPrice = priceMatch[0];
        break;
      }
    }
  }

  console.log('Final extracted price:', data.currentPrice);

  // Try to detect current variation selection - need to get BOTH color and size if present
  const variations = [];

  // Check for color selection - look for elements with selected/swatchselect class
  const colorSelectors = [
    '#variation_color_name .selection',
    '#variation_color_name li.swatchselect',
    '#variation_color_name li.selected',
    '#variation_color_name li[class*="select"]',
    '#variation_color_name select option:checked'
  ];

  for (const selector of colorSelectors) {
    const varElement = document.querySelector(selector);
    if (varElement) {
      let text = varElement.textContent.trim();
      // For li elements, try to get the title attribute first
      if (varElement.tagName === 'LI' || varElement.closest('li')) {
        const li = varElement.tagName === 'LI' ? varElement : varElement.closest('li');
        const title = li.getAttribute('title');
        if (title) text = title;
      }
      if (text && !text.startsWith('{') && !text.startsWith('[')) {
        console.log(`Found color variation: "${text}" using selector: ${selector}`);
        variations.push(text);
        break;
      }
    }
  }

  // Check for size selection
  const sizeSelectors = [
    '#variation_size_name .selection',
    '#variation_size_name li.swatchselect',
    '#variation_size_name li.selected',
    '#variation_size_name li[class*="select"]',
    '#variation_size_name select option:checked'
  ];

  for (const selector of sizeSelectors) {
    const varElement = document.querySelector(selector);
    if (varElement) {
      let text = varElement.textContent.trim();
      // For li elements, try to get the title attribute first
      if (varElement.tagName === 'LI' || varElement.closest('li')) {
        const li = varElement.tagName === 'LI' ? varElement : varElement.closest('li');
        const title = li.getAttribute('title');
        if (title) text = title;
      }
      if (text && !text.startsWith('{') && !text.startsWith('[')) {
        console.log(`Found size variation: "${text}" using selector: ${selector}`);
        variations.push(text);
        break;
      }
    }
  }

  // If no size found with standard selectors, check for standalone SPAN buttons with .a-button-selected
  if (variations.length === 1) { // Only color found, no size yet
    const selectedSpan = document.querySelector('[id^="size_name_"].a-button-selected, [id^="size_name_"] .a-button-selected');
    if (selectedSpan) {
      // Find the actual SPAN button element
      const spanButton = selectedSpan.id && selectedSpan.id.startsWith('size_name_') ? selectedSpan : selectedSpan.closest('[id^="size_name_"]');
      if (spanButton) {
        const innerSpan = spanButton.querySelector('.a-button-text');
        if (innerSpan && innerSpan.textContent) {
          const rawText = innerSpan.textContent;
          const beforeCSS = rawText.split('/*')[0];
          const sizeText = beforeCSS.trim().split(/\s+/)[0];
          console.log(`Found size variation from selected SPAN button: "${sizeText}"`);
          variations.push(sizeText);
        }
      }
    }
  }

  // Combine color and size if both exist, e.g., "White - 14oz"
  if (variations.length > 0) {
    data.currentVariation = variations.join(' - ');
    console.log(`Combined variation name: "${data.currentVariation}"`);
  } else {
    console.log('No variation detected');
  }

  return data;
}

// Function to check if a variation is out of stock or unavailable
function isVariationAvailable(element) {
  // Check for common out-of-stock indicators
  if (element.classList.contains('unselectable')) return false;
  if (element.classList.contains('unavailable')) return false;
  if (element.hasAttribute('aria-disabled') && element.getAttribute('aria-disabled') === 'true') return false;

  // Check if the element or its parent has data indicating unavailability
  const parentLi = element.closest('li');
  if (parentLi) {
    if (parentLi.classList.contains('unselectable')) return false;
    if (parentLi.classList.contains('unavailable')) return false;
  }

  return true;
}

// Helper function to check if a size should be filtered out
function shouldFilterSize(sizeText) {
  if (!sizeText) return false;

  // Ultra-comprehensive filter for 7oz in ANY format
  // Matches: 7oz, 7 oz, 7-oz, 7.0oz, 7.00 oz, (7oz), Size: 7oz, etc.
  const patterns = [
    /\b7\s*-?\s*oz\b/i,           // 7oz, 7 oz, 7-oz
    /\b7\.0+\s*oz\b/i,            // 7.0oz, 7.00 oz
    /\bseven\s*oz\b/i,            // seven oz, seven ounce
    /\(7\s*oz\)/i,                // (7oz), (7 oz)
    /7\s*ounce/i,                 // 7 ounce, 7-ounce
  ];

  const is7oz = patterns.some(pattern => pattern.test(sizeText));

  if (is7oz) {
    console.log(`❌ FILTERING OUT unwanted size: "${sizeText}"`);
    return true;
  }

  // Also filter if the text suggests it's NOT 14oz (our target)
  // If it contains any number OTHER than 14 followed by oz, filter it
  const hasOtherSize = /\b(?!14)\d+(?:\.\d+)?\s*-?\s*oz\b/i.test(sizeText);
  if (hasOtherSize) {
    console.log(`❌ FILTERING OUT non-14oz size: "${sizeText}"`);
    return true;
  }

  return false;
}

// Function to find all variation options
function findVariationOptions() {
  const variations = [];

  // Detect if we have both color and size variations
  const hasColorVariations = document.querySelector('#variation_color_name li, #variation_color_name select') !== null;
  const hasSizeVariations = document.querySelector('#variation_size_name li, #variation_size_name select') !== null;

  console.log(`Variation types found - Color: ${hasColorVariations}, Size: ${hasSizeVariations}`);

  // Look for color swatches
  const colorSwatches = document.querySelectorAll('#variation_color_name li');
  colorSwatches.forEach((swatch, index) => {
    const title = swatch.getAttribute('title') ||
                  swatch.getAttribute('data-defaultasin') ||
                  swatch.textContent.trim();

    if (title && !swatch.classList.contains('unselectable')) {
      const available = isVariationAvailable(swatch);
      let swatchPrice = null;
      const priceElement = swatch.querySelector('.a-button-text .a-size-base, .twister-plus-buying-options-price-data');
      if (priceElement) {
        swatchPrice = priceElement.textContent.trim();
      }

      variations.push({
        element: swatch,
        name: title,
        index: index,
        swatchPrice: swatchPrice,
        available: available,
        type: 'color'
      });
    }
  });

  // Look for size swatches (color-style li elements)
  const sizeSwatches = document.querySelectorAll('#variation_size_name li');
  sizeSwatches.forEach((swatch, index) => {
    const title = swatch.getAttribute('title') ||
                  swatch.getAttribute('data-defaultasin') ||
                  swatch.textContent.trim();

    if (title && !swatch.classList.contains('unselectable') && !shouldFilterSize(title)) {
      const available = isVariationAvailable(swatch);
      let swatchPrice = null;
      const priceElement = swatch.querySelector('.a-button-text .a-size-base, .twister-plus-buying-options-price-data');
      if (priceElement) {
        swatchPrice = priceElement.textContent.trim();
      }

      console.log(`✅ Adding size swatch: "${title}", Available: ${available}`);
      variations.push({
        element: swatch,
        name: title,
        index: index,
        swatchPrice: swatchPrice,
        available: available,
        type: 'size'
      });
    }
  });

  // Look for size BUTTONS (button-style variations like 7oz, 12oz, 14oz)
  // Amazon uses different formats: #variation_size_name structure OR id="size_name_0" standalone buttons
  let sizeButtons = document.querySelectorAll('#variation_size_name input[type="radio"], #variation_size_name button, #variation_size_name .a-button-input');

  // If no buttons found in #variation_size_name, look for standalone size_name_N buttons
  if (sizeButtons.length === 0) {
    console.log(`🔍 No buttons in #variation_size_name, looking for standalone size_name_N buttons...`);
    sizeButtons = document.querySelectorAll('[id^="size_name_"]:not([id$="-announce"])');
    console.log(`🔍 Found ${sizeButtons.length} standalone size buttons with id^="size_name_"`);
  } else {
    console.log(`🔍 Found ${sizeButtons.length} size buttons in #variation_size_name, checking each...`);
  }
  sizeButtons.forEach((button, index) => {
    let buttonText = '';
    let buttonElement = button;

    // For standalone size_name_N buttons, the button itself is a SPAN
    if (button.tagName === 'SPAN' && button.id && button.id.startsWith('size_name_')) {
      // Try to find the .a-button-text element (contains the size like "7oz", "12oz", "14oz")
      const innerSpan = button.querySelector('.a-button-text');

      if (innerSpan && innerSpan.textContent) {
        // The text content has format: "    7oz              /* Temporary CSS..."
        // We need to extract just "7oz" from this
        const rawText = innerSpan.textContent;

        // Remove CSS comments and everything after them
        const beforeCSS = rawText.split('/*')[0];

        // Trim and collapse multiple spaces, then get the first word
        buttonText = beforeCSS.trim().split(/\s+/)[0];

        console.log(`   Standalone SPAN button ${index}: id="${button.id}"`);
        console.log(`   Raw text: "${rawText.substring(0, 80)}"`);
        console.log(`   Extracted size: "${buttonText}"`);
      } else {
        // Fallback: try aria-labelledby to find associated label
        const ariaLabelledBy = button.querySelector('input')?.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelElement = document.getElementById(ariaLabelledBy);
          if (labelElement) {
            buttonText = labelElement.textContent.trim();
          }
        }

        console.log(`   Standalone SPAN button ${index}: id="${button.id}" - No .a-button-text found`);
        console.log(`   Fallback extracted: "${buttonText}"`);
      }
    } else {
      // Original logic for buttons inside #variation_size_name
      let parentElement = button.closest('li') || button.closest('.a-button-group') || button.closest('[data-csa-c-element-id]');
      if (parentElement) {
        buttonText = parentElement.getAttribute('title') ||
                     parentElement.textContent.trim() ||
                     button.value ||
                     button.getAttribute('aria-label');
      }
    }

    // Clean up button text (remove extra whitespace, "See available options", CSS, prices, etc.)
    // Remove CSS comments, prices, delivery info, and other contamination
    if (buttonText) {
      buttonText = buttonText
        .split(/\/\*|<!--|<style/i)[0]  // Cut off at CSS/HTML comments or style tags
        .replace(/\$[\d.,]+/g, '')       // Remove prices like $39.99
        .replace(/See available options?/gi, '')
        .replace(/FREE Delivery/gi, '')
        .replace(/Only \d+ left in stock/gi, '')
        .replace(/In Stock/gi, '')
        .replace(/per count/gi, '')
        .replace(/\(.+?\)/g, '')         // Remove parenthetical content
        .replace(/\s+/g, ' ')            // Collapse multiple spaces
        .trim();

      // Final extraction: get just the size (first word)
      const words = buttonText.split(/\s+/);
      if (words.length > 0 && words[0].match(/\d+(oz|ml|g|kg|lb)/i)) {
        buttonText = words[0];
      }
    }

    console.log(`   Cleaned button ${index}: "${buttonText}"`);

    if (buttonText && !shouldFilterSize(buttonText)) {
      // Check if button is unavailable/disabled
      const isDisabled = button.disabled ||
                         button.getAttribute('aria-disabled') === 'true' ||
                         button.classList.contains('a-button-unavailable') ||
                         button.classList.contains('a-button-disabled');

      console.log(`   ✅ Adding size button: "${buttonText}", Disabled: ${isDisabled}`);
      variations.push({
        element: button,  // For SPAN buttons, click the SPAN itself
        buttonElement: button,
        name: buttonText,
        index: index,
        isButton: true,
        isSpanButton: button.tagName === 'SPAN',
        available: !isDisabled,
        type: 'size'
      });
    }
  });

  // Also check for dropdown-style variations
  const colorDropdowns = document.querySelectorAll('#variation_color_name select option');
  colorDropdowns.forEach((option, index) => {
    if (option.value && option.value !== '') {
      variations.push({
        element: option,
        name: option.textContent.trim(),
        index: index,
        isDropdown: true,
        available: !option.disabled,
        type: 'color'
      });
    }
  });

  const sizeDropdowns = document.querySelectorAll('#variation_size_name select option');
  console.log(`🔍 Found ${sizeDropdowns.length} size dropdown options, checking each...`);
  sizeDropdowns.forEach((option, index) => {
    const optionText = option.textContent.trim();
    const optionValue = option.value;
    const isDisabled = option.disabled;

    console.log(`   Option ${index}: "${optionText}" (value="${optionValue}", disabled=${isDisabled})`);

    if (option.value && option.value !== '' && !shouldFilterSize(optionText)) {
      console.log(`   ✅ Adding size dropdown: "${optionText}"`);
      variations.push({
        element: option,
        name: optionText,
        index: index,
        isDropdown: true,
        available: !option.disabled,
        type: 'size'
      });
    }
  });

  // Log summary of what we found
  const colorCount = variations.filter(v => v.type === 'color').length;
  const sizeCount = variations.filter(v => v.type === 'size').length;
  console.log(`📊 SUMMARY: Found ${colorCount} colors and ${sizeCount} sizes after filtering`);
  variations.filter(v => v.type === 'size').forEach(s => {
    console.log(`   📏 Size: "${s.name}" (Available: ${s.available})`);
  });

  return variations;
}

// Function to click through all variations and collect prices
async function scanAllVariations() {
  // Reset stop flag at the start of every scan
  shouldStopScan = false;

  const variations = findVariationOptions();

  if (variations.length === 0) {
    return {
      success: false,
      message: 'No variations found on this page'
    };
  }

  const results = [];
  const initialData = extractProductData();

  // Separate colors and sizes
  const colors = variations.filter(v => v.type === 'color');
  const sizes = variations.filter(v => v.type === 'size');

  console.log(`Starting scan - ${colors.length} colors, ${sizes.length} sizes`);

  // If we have both colors AND sizes, scan all combinations
  if (colors.length > 0 && sizes.length > 0) {
    console.log(`Scanning ${colors.length} x ${sizes.length} = ${colors.length * sizes.length} combinations`);

    // Get the target size we want (should be 14oz)
    const targetSize = sizes.length > 0 ? sizes[0] : null;
    if (targetSize) {
      console.log(`Target size for all scans: ${targetSize.name}`);
    }

    for (let colorIndex = 0; colorIndex < colors.length; colorIndex++) {
      const color = colors[colorIndex];

      // Send progress update at the start of each color
      chrome.runtime.sendMessage({
        type: 'scanProgress',
        current: colorIndex + 1,
        total: colors.length
      });

      // Check if scan should be stopped
      if (shouldStopScan) {
        console.log('Scan stopped by user');
        break;
      }

      // IMPORTANT: First ensure we're on the correct size (14oz) before clicking color
      // This prevents getting stuck on 7oz from previous color
      if (targetSize) {
        console.log(`Pre-selecting target size ${targetSize.name} before color change`);
        if (targetSize.isDropdown) {
          targetSize.element.selected = true;
          targetSize.element.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (targetSize.isButton) {
          // For button-style size selections, click the button input or parent
          console.log(`Clicking button-style size selector for ${targetSize.name}`);
          if (targetSize.buttonElement) {
            targetSize.buttonElement.click();
          } else {
            targetSize.element.click();
          }
        } else {
          targetSize.element.click();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Click the color
      console.log(`Clicking color: ${color.name}`);
      if (color.isDropdown) {
        color.element.selected = true;
        color.element.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        color.element.click();
      }

      // Wait for Amazon to update the page after color change
      await new Promise(resolve => setTimeout(resolve, 800));

      // CRITICAL: Re-select 14oz AFTER color change because Amazon may have switched to 7oz
      console.log(`🔄 Re-selecting 14oz after color change to ${color.name}`);
      let foundButton = false; // Declare here for broader scope
      let allFoundElements = []; // Declare here for broader scope
      if (targetSize) {
        if (targetSize.isDropdown) {
          // Re-query the dropdown to get fresh element
          const freshDropdown = document.querySelector('#variation_size_name select');
          if (freshDropdown) {
            const targetOption = Array.from(freshDropdown.options).find(opt =>
              opt.textContent.trim() === targetSize.name && !opt.disabled
            );
            if (targetOption) {
              targetOption.selected = true;
              freshDropdown.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`✅ Re-selected dropdown option: ${targetSize.name}`);
            } else {
              console.warn(`⚠️ Could not find enabled option for ${targetSize.name} - color may not have this size`);
            }
          }
        } else if (targetSize.isButton) {
          // EXTENSIVE DEBUGGING: Let's see what we're working with
          console.log(`🔍 DEBUG: Looking for 14oz button after color change to ${color.name}`);
          console.log(`🔍 DEBUG: Target size name = "${targetSize.name}"`);

          // Try multiple selection strategies
          const sizeNameDiv = document.querySelector('#variation_size_name');
          if (sizeNameDiv) {
            console.log(`✅ Found #variation_size_name div`);
            console.log(`📋 DEBUG: Full HTML of size selector:`, sizeNameDiv.innerHTML);
          }

          // Strategy 1: Look for all possible button/input elements
          const selectors = [
            '#variation_size_name input[type="radio"]',
            '#variation_size_name button',
            '#variation_size_name .a-button-input',
            '#variation_size_name input',
            '#variation_size_name [role="radio"]',
            '#variation_size_name .a-declarative input',
            '#variation_size_name li input',
            '[id^="size_name_"]:not([id$="-announce"])'  // Standalone size_name_N SPAN buttons
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            console.log(`🔍 Selector "${selector}" found ${elements.length} elements`);
            allFoundElements.push(...Array.from(elements));
          }

          // Remove duplicates
          allFoundElements = [...new Set(allFoundElements)];
          console.log(`📊 Total unique elements found: ${allFoundElements.length}`);

          for (let i = 0; i < allFoundElements.length; i++) {
            const button = allFoundElements[i];
            console.log(`\n🔍 Examining element ${i}:`);
            console.log(`   Tag: ${button.tagName}`);
            console.log(`   Type: ${button.type}`);
            console.log(`   ID: ${button.id}`);
            console.log(`   Name: ${button.name}`);
            console.log(`   Value: ${button.value}`);
            console.log(`   Aria-label: ${button.getAttribute('aria-label')}`);
            console.log(`   Disabled: ${button.disabled}`);

            let buttonText = '';

            // For standalone SPAN buttons with id="size_name_N"
            if (button.tagName === 'SPAN' && button.id && button.id.startsWith('size_name_')) {
              // Use same extraction logic as initial scan
              const innerSpan = button.querySelector('.a-button-text');
              if (innerSpan && innerSpan.textContent) {
                const rawText = innerSpan.textContent;
                const beforeCSS = rawText.split('/*')[0];
                buttonText = beforeCSS.trim().split(/\s+/)[0];
                console.log(`   📝 SPAN button raw text: "${rawText.substring(0, 80)}"`);
                console.log(`   📝 SPAN button extracted: "${buttonText}"`);
              }
            } else {
              const parentElement = button.closest('li') || button.closest('.a-button-group') || button.closest('[data-csa-c-element-id]') || button.parentElement;
              console.log(`   Parent element: ${parentElement?.tagName} ${parentElement?.className}`);

              if (parentElement) {
                buttonText = parentElement.getAttribute('title') ||
                             parentElement.textContent.trim() ||
                             button.value ||
                             button.getAttribute('aria-label') ||
                             '';
              }
            }

            // Apply same aggressive cleaning as initial scan
            if (buttonText) {
              buttonText = buttonText
                .split(/\/\*|<!--|<style/i)[0]
                .replace(/\$[\d.,]+/g, '')
                .replace(/See available options?/gi, '')
                .replace(/FREE Delivery/gi, '')
                .replace(/Only \d+ left in stock/gi, '')
                .replace(/In Stock/gi, '')
                .replace(/per count/gi, '')
                .replace(/\(.+?\)/g, '')
                .replace(/\s+/g, ' ')
                .trim();

              const words = buttonText.split(/\s+/);
              if (words.length > 0 && words[0].match(/\d+(oz|ml|g|kg|lb)/i)) {
                buttonText = words[0];
              }
            }
            console.log(`   📝 Final extracted text: "${buttonText}"`);

              // Try to match 14oz
              if (buttonText && (buttonText.includes('14') && buttonText.toLowerCase().includes('oz'))) {
                const isDisabled = button.disabled ||
                                   button.getAttribute('aria-disabled') === 'true' ||
                                   button.classList.contains('a-button-unavailable') ||
                                   button.classList.contains('a-button-disabled');
                console.log(`   🎯 MATCH! This is the 14oz button! Disabled: ${isDisabled}`);

                if (!isDisabled) {
                  console.log(`   🖱️ Attempting to click...`);

                  // Try multiple click strategies
                  try {
                    // Strategy 1: Click the input directly
                    button.click();
                    console.log(`   ✅ Clicked input directly`);
                  } catch (e) {
                    console.log(`   ❌ Direct click failed: ${e.message}`);
                  }

                  try {
                    // Strategy 2: Click the parent
                    parentElement.click();
                    console.log(`   ✅ Clicked parent element`);
                  } catch (e) {
                    console.log(`   ❌ Parent click failed: ${e.message}`);
                  }

                  try {
                    // Strategy 3: Set checked property and dispatch event
                    if (button.type === 'radio') {
                      button.checked = true;
                      button.dispatchEvent(new Event('change', { bubbles: true }));
                      button.dispatchEvent(new Event('click', { bubbles: true }));
                      console.log(`   ✅ Set checked=true and dispatched events`);
                    }
                  } catch (e) {
                    console.log(`   ❌ Checked/event failed: ${e.message}`);
                  }

                  foundButton = true;
                  await new Promise(resolve => setTimeout(resolve, 600));
                  console.log(`✅ 14oz button interaction complete`);
                  break;
                } else {
                  console.warn(`⚠️ 14oz button is DISABLED for color ${color.name}`);
                }
              }
            }
          }

          if (!foundButton) {
            console.error(`❌ Could not find enabled 14oz button for color ${color.name} - SKIPPING`);
            console.error(`❌ DEBUG: Dumping all button texts found:`);
            allFoundElements.forEach((el, i) => {
              const parent = el.closest('li') || el.parentElement;
              const text = parent?.textContent.trim() || el.value || 'N/A';
              console.error(`   Button ${i}: "${text}"`);
            });
            continue; // Skip this color entirely
          }
        }

        // Wait for the re-selection to take effect
        await new Promise(resolve => setTimeout(resolve, 300));

      // Re-query size elements after color change since DOM may have updated
      const updatedSizes = [];

      // Check for swatch-style sizes
      const sizeSwatches = document.querySelectorAll('#variation_size_name li');
      sizeSwatches.forEach((swatch, index) => {
        const title = swatch.getAttribute('title') ||
                      swatch.getAttribute('data-defaultasin') ||
                      swatch.textContent.trim();

        if (title && !swatch.classList.contains('unselectable') && !shouldFilterSize(title)) {
          const available = isVariationAvailable(swatch);
          console.log(`Re-queried size swatch: ${title}, Available: ${available}`);
          updatedSizes.push({
            element: swatch,
            name: title,
            index: index,
            available: available,
            type: 'size'
          });
        }
      });

      // Check for button-style sizes
      if (updatedSizes.length === 0) {
        let sizeButtons = document.querySelectorAll('#variation_size_name input[type="radio"], #variation_size_name button, #variation_size_name .a-button-input');

        // If no buttons in #variation_size_name, look for standalone size_name_N buttons
        if (sizeButtons.length === 0) {
          sizeButtons = document.querySelectorAll('[id^="size_name_"]:not([id$="-announce"])');
          console.log(`Re-querying ${sizeButtons.length} standalone size_name_N buttons after color change...`);
        } else {
          console.log(`Re-querying ${sizeButtons.length} size buttons after color change...`);
        }

        sizeButtons.forEach((button, index) => {
          let buttonText = '';

          // For standalone size_name_N buttons
          if (button.tagName === 'SPAN' && button.id && button.id.startsWith('size_name_')) {
            // Try to find the .a-button-text element (contains the size like "7oz", "12oz", "14oz")
            const innerSpan = button.querySelector('.a-button-text');

            if (innerSpan && innerSpan.textContent) {
              // The text content has format: "    7oz              /* Temporary CSS..."
              // We need to extract just "7oz" from this
              const rawText = innerSpan.textContent;

              // Remove CSS comments and everything after them
              const beforeCSS = rawText.split('/*')[0];

              // Trim and collapse multiple spaces, then get the first word
              buttonText = beforeCSS.trim().split(/\s+/)[0];
              console.log(`   📝 SPAN button raw text: "${rawText.substring(0, 80)}"`);
              console.log(`   📝 SPAN button extracted: "${buttonText}"`);
            } else {
              // Fallback to full text if no inner span found
              buttonText = button.textContent.trim();
            }
          } else {
            // Original logic
            let parentElement = button.closest('li') || button.closest('.a-button-group') || button.closest('[data-csa-c-element-id]');
            if (parentElement) {
              buttonText = parentElement.getAttribute('title') ||
                           parentElement.textContent.trim() ||
                           button.value ||
                           button.getAttribute('aria-label');
            }
          }

          // Clean up button text (remove extra whitespace, "See available options", CSS, prices, etc.)
          if (buttonText) {
            buttonText = buttonText
              .split(/\/\*|<!--|<style/i)[0]  // Cut off at CSS/HTML comments
              .replace(/\$[\d.,]+/g, '')       // Remove prices like $39.99
              .replace(/See available options?/gi, '')
              .replace(/FREE Delivery/gi, '')
              .replace(/Only \d+ left in stock/gi, '')
              .replace(/In Stock/gi, '')
              .replace(/per count/gi, '')
              .replace(/\(.+?\)/g, '')         // Remove parenthetical content
              .replace(/\s+/g, ' ')            // Collapse multiple spaces
              .trim();

            // Final extraction: get just the size (first word)
            const words = buttonText.split(/\s+/);
            if (words.length > 0 && words[0].match(/\d+(oz|ml|g|kg|lb)/i)) {
              buttonText = words[0];
            }
          }

          console.log(`   Re-queried button: "${buttonText}"`);

          if (buttonText && !shouldFilterSize(buttonText)) {
            const isDisabled = button.disabled ||
                               button.getAttribute('aria-disabled') === 'true' ||
                               button.classList.contains('a-button-unavailable') ||
                               button.classList.contains('a-button-disabled');
            console.log(`   Available: ${!isDisabled}`);
            updatedSizes.push({
              element: button,
              buttonElement: button,
              name: buttonText,
              index: index,
              isButton: true,
              isSpanButton: button.tagName === 'SPAN',
              available: !isDisabled,
              type: 'size'
            });
          }
        });
      }

      // Also check for dropdown size options
      const sizeDropdown = document.querySelector('#variation_size_name select');
      if (sizeDropdown && updatedSizes.length === 0) {
        const options = sizeDropdown.querySelectorAll('option');
        options.forEach((option, index) => {
          const optionText = option.textContent.trim();
          const isDisabled = option.disabled;

          console.log(`Checking dropdown option: "${optionText}", Disabled: ${isDisabled}`);

          if (option.value && option.value !== '' && !isDisabled && !shouldFilterSize(optionText)) {
            updatedSizes.push({
              element: option,
              name: optionText,
              index: index,
              isDropdown: true,
              available: true,
              type: 'size'
            });
          }
        });
      }

      if (color) {
        console.log(`After re-query for color ${color.name}: Found ${updatedSizes.length} available sizes`);
      }

      // Check if our target size (14oz) is available for this color
      const targetSizeAvailable = updatedSizes.length > 0 ?
        updatedSizes.some(s => s.name === targetSize.name && s.available !== false) :
        false;

      // Use updated size elements or fall back to original if none found
      const sizesToScan = updatedSizes.length > 0 ? updatedSizes : sizes;

      // Only scan the target size (14oz) - filter out any other sizes
      const filteredSizesToScan = sizesToScan.filter(s => s.name === targetSize.name);

      if (targetSizeAvailable && filteredSizesToScan.length > 0) {
        if (color) {
          console.log(`Will scan ${filteredSizesToScan.length} size(s) for color ${color.name}: ${filteredSizesToScan.map(s => s.name).join(', ')}`);
        }

        // Now try each size for this color
        for (let sizeIndex = 0; sizeIndex < filteredSizesToScan.length; sizeIndex++) {
        const size = filteredSizesToScan[sizeIndex];

        if (shouldStopScan) {
          console.log('Scan stopped by user');
          break;
        }

        try {
          console.log(`Scanning ${color.name} - ${size.name}`);

          // Skip if this size is not available for this color
          if (size.available === false) {
            console.log(`Skipping unavailable size: ${size.name} for color: ${color.name}`);
            continue;
          }

          // Click the size - make sure we're clicking the fresh element
          if (size.isDropdown) {
            size.element.selected = true;
            size.element.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (size.isButton) {
            console.log(`Clicking button-style size: ${size.name}`);
            if (size.buttonElement) {
              size.buttonElement.click();
            } else {
              size.element.click();
            }
          } else {
            size.element.click();
          }

          // Wait for price to update after size change
          await new Promise(resolve => setTimeout(resolve, 800));

          // ULTRA-CRITICAL: Verify we're actually on 14oz before extracting price
          console.log(`🔍 Verifying we're on the correct size before extracting price...`);

          // Extract data
          const data = extractProductData();

          // Verify the actual selected variation matches what we expect
          const actualVariation = data.currentVariation;
          const expectedVariation = `${color.name} - ${size.name}`;

          console.log(`Expected: "${expectedVariation}", Actual: "${actualVariation}"`);

          // Check if Amazon auto-switched to a different size (means the size we wanted is out of stock)
          if (actualVariation && !actualVariation.includes(size.name)) {
            console.error(`❌ Amazon switched from "${size.name}" to different size in "${actualVariation}" - this color doesn't have ${size.name} in stock. SKIPPING.`);
            continue;
          }

          // Double-check: Make sure the variation name doesn't contain unwanted sizes
          if (actualVariation && shouldFilterSize(actualVariation)) {
            console.error(`❌ Detected unwanted size in actual variation "${actualVariation}" - SKIPPING`);
            continue;
          }

          // Triple check: verify the expected size name doesn't contain unwanted sizes
          if (shouldFilterSize(size.name)) {
            console.error(`❌ Expected size "${size.name}" contains unwanted size - SKIPPING`);
            continue;
          }

          // Quadruple check: Make sure we're actually on 14oz by checking the page
          const currentlySelectedSizeButton = document.querySelector('#variation_size_name input[type="radio"]:checked, #variation_size_name .a-button-selected');
          if (currentlySelectedSizeButton) {
            const parentElement = currentlySelectedSizeButton.closest('li') || currentlySelectedSizeButton.closest('.a-button-group') || currentlySelectedSizeButton.closest('[data-csa-c-element-id]');
            if (parentElement) {
              let buttonText = parentElement.getAttribute('title') ||
                               parentElement.textContent.trim() ||
                               currentlySelectedSizeButton.value ||
                               currentlySelectedSizeButton.getAttribute('aria-label');
              buttonText = buttonText.replace(/See available options?/gi, '').trim();

              console.log(`🔍 Currently selected size button: "${buttonText}"`);

              if (shouldFilterSize(buttonText)) {
                console.error(`❌ CRITICAL: Currently selected button "${buttonText}" is NOT 14oz! SKIPPING.`);
                continue;
              }
            }
          }

          // Use the expected variation name for consistency
          data.variationName = expectedVariation;

          console.log(`💰 Extracted price for ${data.variationName}: ${data.currentPrice}`);

          // FINAL SAFETY CHECK before adding to results
          if (shouldFilterSize(data.variationName)) {
            console.error(`🚨 CRITICAL: Somehow got a 7oz variation "${data.variationName}" - BLOCKING from results!`);
          } else if (data.currentPrice && data.currentPrice !== '') {
            data.available = true;
            results.push(data);
            console.log(`✅ Added to results: ${data.variationName} - ${data.currentPrice}`);
          } else {
            console.warn(`⚠️ No price found for ${data.variationName}`);
          }

        } catch (error) {
          if (color && size) {
            console.error(`Error scanning ${color.name} - ${size.name}:`, error);
          } else {
            console.error(`Error scanning variation:`, error);
          }
        }
        } // Close size for-loop from line 913
      } else { // Close the if block for target size availability check
        if (color) {
          console.warn(`Target size ${targetSize.name} not available for color ${color.name} - SKIPPING this color entirely`);
        }
      }
    } // Close color for-loop from line 536

    console.log(`Combination scan complete. Found ${results.length} variations with prices.`);

    return {
      success: true,
      results: results,
      totalScanned: results.length
    };
  }

  // If only colors OR only sizes (not both), scan individually
  console.log(`Starting scan of ${variations.length} variations`);

  for (let i = 0; i < variations.length; i++) {
    const variation = variations[i];

    // Check if scan should be stopped
    if (shouldStopScan) {
      console.log('Scan stopped by user');
      break;
    }

    try {
      console.log(`Scanning variation ${i + 1}/${variations.length}: ${variation.name} (Available: ${variation.available})`);

      // Skip if variation is unavailable
      if (!variation.available) {
        console.log(`Skipping unavailable variation: ${variation.name}`);

        // Still add to results but mark as unavailable
        results.push({
          productTitle: initialData.productTitle,
          currentPrice: 'Out of Stock',
          currentVariation: variation.name,
          variationName: variation.name,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          asin: initialData.asin,
          available: false
        });

        chrome.runtime.sendMessage({
          type: 'scanProgress',
          current: i + 1,
          total: variations.length
        });
        continue;
      }

      // Click the variation
      if (variation.isDropdown) {
        variation.element.selected = true;
        variation.element.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        variation.element.click();
      }

      // Wait for price to update
      await new Promise(resolve => setTimeout(resolve, 800));

      // Extract data AFTER the wait
      const data = extractProductData();

      // Use the detected variation name which includes both color and size
      const actualVariation = data.currentVariation;

      // For single-dimension variations, check if Amazon auto-switched
      if (variation.type && actualVariation && !actualVariation.includes(variation.name)) {
        console.warn(`Amazon auto-switched from "${variation.name}" to "${actualVariation}" - marking original as unavailable`);

        // Mark the original variation as out of stock
        results.push({
          productTitle: initialData.productTitle,
          currentPrice: 'Out of Stock',
          currentVariation: actualVariation,
          variationName: variation.name,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          asin: initialData.asin,
          available: false
        });
      } else {
        // Use the full variation name detected from the page (includes color + size if both exist)
        data.variationName = actualVariation || variation.name;

        console.log(`Extracted price for ${data.variationName}: ${data.currentPrice}`);

        // If we found a price on the swatch itself and no price was extracted from the page,
        // use the swatch price as a fallback
        if (variation.swatchPrice && (!data.currentPrice || data.currentPrice === '')) {
          console.log(`Using swatch price for ${data.variationName}: ${variation.swatchPrice}`);
          data.currentPrice = variation.swatchPrice;
        }

        // Only add if we have a valid price
        if (data.currentPrice && data.currentPrice !== '') {
          data.available = true;
          results.push(data);
        } else {
          console.warn(`No price found for variation: ${data.variationName}`);
        }
      }

      // Update progress
      chrome.runtime.sendMessage({
        type: 'scanProgress',
        current: i + 1,
        total: variations.length
      });

    } catch (error) {
      console.error('Error scanning variation:', variation.name, error);
    }
  }

  console.log(`Scan complete. Found ${results.length} variations with prices.`);

  return {
    success: true,
    results: results,
    totalScanned: results.length
  };
} // Close scanAllVariations

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCurrentPrice') {
    const data = extractProductData();
    sendResponse(data);
  } else if (request.action === 'scanAllVariations') {
    shouldStopScan = false; // Reset stop flag at start of scan
    scanAllVariations().then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'getVariationCount') {
    const variations = findVariationOptions();
    sendResponse({ count: variations.length });
  } else if (request.action === 'stopScan') {
    shouldStopScan = true;
    console.log('Stop scan requested');
    sendResponse({ success: true });
  }
});
