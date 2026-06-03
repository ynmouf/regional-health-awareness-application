import { suggest } from '../geocoding.js';

const DEBOUNCE_MS = 400;

export function initSearch(onSearch) {
  const input = document.getElementById('search-input');
  const btn = document.getElementById('btn-search');
  const list = document.getElementById('search-suggestions');

  let debounceTimer = null;
  let selectedIdx = -1;
  let currentSuggestions = [];

  // Debounced autocomplete
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { hideSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
  });

  // Keyboard nav
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Escape') { hideSuggestions(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && currentSuggestions[selectedIdx]) {
        selectSuggestion(currentSuggestions[selectedIdx]);
      } else {
        submitSearch(input.value.trim());
      }
    }
  });

  btn.addEventListener('click', () => submitSearch(input.value.trim()));

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
  });

  async function fetchSuggestions(q) {
    const results = await suggest(q);
    currentSuggestions = results;
    selectedIdx = -1;
    if (!results.length) { hideSuggestions(); return; }
    renderSuggestions(results);
  }

  function renderSuggestions(results) {
    list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.role = 'option';
      li.dataset.idx = i;
      li.innerHTML = `
        <svg class="suggestion-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M6 9c0-2 3-3 3-5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        ${escHtml(r.label)}
      `;
      li.addEventListener('mousedown', e => { e.preventDefault(); selectSuggestion(r); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function selectSuggestion(suggestion) {
    input.value = suggestion.label;
    hideSuggestions();
    onSearch(suggestion.label, suggestion);
  }

  function submitSearch(q) {
    if (!q) return;
    hideSuggestions();
    onSearch(q, null);
  }

  function hideSuggestions() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    selectedIdx = -1;
    currentSuggestions = [];
  }

  function moveFocus(dir) {
    const items = list.querySelectorAll('.suggestion-item');
    if (!items.length) return;
    items[selectedIdx]?.removeAttribute('aria-selected');
    selectedIdx = Math.max(0, Math.min(items.length - 1, selectedIdx + dir));
    items[selectedIdx].setAttribute('aria-selected', 'true');
    items[selectedIdx].scrollIntoView({ block: 'nearest' });
    input.value = currentSuggestions[selectedIdx].label;
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
