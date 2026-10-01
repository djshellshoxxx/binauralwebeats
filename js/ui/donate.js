// Donation card: copy the Monero address to the clipboard.

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers / contexts without the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function bindDonate(root = document) {
  const button = root.getElementById('xmr-copy');
  const status = root.getElementById('xmr-status');
  if (!button) return;
  let timer = 0;
  button.addEventListener('click', async () => {
    const ok = await copyText(button.dataset.address);
    status.textContent = ok ? 'Address copied. Thank you! ♥' : 'Copy failed. Please select the address and copy it manually.';
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ''; }, 4000);
  });
}
