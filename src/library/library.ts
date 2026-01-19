import * as db from '../db';
import type { SavedCard } from '../db';

let allCards: SavedCard[] = [];
let filteredCards: SavedCard[] = [];
let cardToDelete: SavedCard | null = null;

async function loadCards() {
  const loading = document.getElementById('loading');
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');

  try {
    allCards = await db.getAllCards();
    filteredCards = allCards;

    updateCardCount();

    if (allCards.length === 0) {
      loading!.style.display = 'none';
      emptyState!.style.display = 'block';
    } else {
      renderCards(allCards);
      loading!.style.display = 'none';
      container!.style.display = 'grid';
    }
  } catch (error) {
    console.error('Failed to load cards:', error);
    loading!.innerHTML = '<p>Error loading cards. Please refresh the page.</p>';
  }
}

function renderCards(cards: SavedCard[]) {
  const container = document.getElementById('cards-container')!;
  container.innerHTML = '';

  cards.forEach((card) => {
    const cardElement = document.createElement('div');
    cardElement.className = 'card-item';

    // Create image URL from blob
    const imageUrl = URL.createObjectURL(card.imageBlob);

    cardElement.innerHTML = `
      <img src="${imageUrl}" alt="${card.name}" class="card-image-preview" />
      <div class="card-info">
        <h3 class="card-name">${escapeHtml(card.name)}</h3>
        <div class="card-type">${escapeHtml(card.type)} — ${escapeHtml(card.subtype)}</div>
        <div class="card-mana">${escapeHtml(card.manaCost.join(', '))}</div>
        <div class="card-actions">
          <button class="delete-btn" onclick="openDeleteModal('${card.id}', '${escapeHtmlAttr(card.name)}')">Delete</button>
        </div>
      </div>
    `;

    container.appendChild(cardElement);
  });
}

function updateCardCount() {
  const count = document.getElementById('card-count')!;
  count.textContent = filteredCards.length.toString();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function deleteCard(cardId: string) {
  try {
    await db.deleteCard(cardId);
    allCards = allCards.filter((c) => c.id !== cardId);
    filteredCards = filteredCards.filter((c) => c.id !== cardId);
    updateCardCount();

    if (allCards.length === 0) {
      const container = document.getElementById('cards-container')!;
      const emptyState = document.getElementById('empty-state')!;
      container.style.display = 'none';
      emptyState.style.display = 'block';
    } else {
      renderCards(filteredCards);
    }
  } catch (error) {
    console.error('Failed to delete card:', error);
    alert('Failed to delete card. Please try again.');
  }
}

function filterCards(query: string) {
  const lower = query.toLowerCase();
  filteredCards = allCards.filter(
    (card) =>
      card.name.toLowerCase().includes(lower) ||
      card.type.toLowerCase().includes(lower) ||
      card.subtype.toLowerCase().includes(lower)
  );
  updateCardCount();
  renderCards(filteredCards);
}

// Global functions for HTML event handlers
(window as any).openDeleteModal = (cardId: string, cardName: string) => {
  cardToDelete = allCards.find((c) => c.id === cardId) || null;
  const modal = document.getElementById('delete-modal')!;
  const nameElement = document.getElementById('delete-card-name')!;
  nameElement.textContent = `Are you sure you want to delete "${cardName}"?`;
  modal.classList.add('active');
};

(window as any).closeDeleteModal = () => {
  const modal = document.getElementById('delete-modal')!;
  modal.classList.remove('active');
  cardToDelete = null;
};

(window as any).confirmDelete = async () => {
  if (cardToDelete) {
    await deleteCard(cardToDelete.id);
    (window as any).closeDeleteModal();
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search') as HTMLInputElement;
  searchInput.addEventListener('input', (e) => {
    filterCards((e.target as HTMLInputElement).value);
  });

  loadCards();
});
