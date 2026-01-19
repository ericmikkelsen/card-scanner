import * as db from './db';
import type { SavedCard } from './db';

let allCards: SavedCard[] = [];
let filteredCards: SavedCard[] = [];
let cardToDelete: SavedCard | null = null;

async function loadCards() {
  const loading = document.getElementById('loading');
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  if (!loading || !container || !emptyState) return;

  try {
    allCards = await db.getAllCards();
    filteredCards = allCards;
    updateCardCount();

    loading.style.display = 'none';
    if (allCards.length === 0) {
      emptyState.style.display = 'block';
    } else {
      container.style.display = 'grid';
      renderCards(allCards);
    }
  } catch (error) {
    console.error('Failed to load cards:', error);
    loading.innerHTML = '<p>Error loading cards. Please refresh the page.</p>';
  }
}

function renderCards(cards: SavedCard[]) {
  const container = document.getElementById('cards-container');
  if (!container) return;
  
  container.innerHTML = cards.map((card) => {
    const imageUrl = URL.createObjectURL(card.imageBlob);
    return `
      <div class="card-item">
        <img src="${imageUrl}" alt="${escapeHtml(card.name)}" class="card-image-preview" />
        <div class="card-info">
          <h3 class="card-name">${escapeHtml(card.name)}</h3>
          <p class="card-type">${escapeHtml(card.type)} — ${escapeHtml(card.subtype)}</p>
          <p class="card-mana">${escapeHtml(card.manaCost.join(', '))}</p>
          <button class="delete-btn" data-card-id="${card.id}" data-card-name="${escapeHtml(card.name)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateCardCount() {
  const count = document.getElementById('card-count');
  if (count) count.textContent = String(filteredCards.length);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function deleteCard(cardId: string) {
  try {
    await db.deleteCard(cardId);
    allCards = allCards.filter((c) => c.id !== cardId);
    filteredCards = filteredCards.filter((c) => c.id !== cardId);
    updateCardCount();

    const container = document.getElementById('cards-container');
    const emptyState = document.getElementById('empty-state');
    
    if (allCards.length === 0 && container && emptyState) {
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

function openDeleteModal(cardId: string, cardName: string) {
  cardToDelete = allCards.find((c) => c.id === cardId) || null;
  const modal = document.getElementById('delete-modal');
  const nameElement = document.getElementById('delete-card-name');
  if (!modal || !nameElement) return;
  
  nameElement.textContent = `Are you sure you want to delete "${cardName}"?`;
  modal.classList.add('active');
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (!modal) return;
  
  modal.classList.remove('active');
  cardToDelete = null;
}

async function confirmDelete() {
  if (cardToDelete) {
    await deleteCard(cardToDelete.id);
    closeDeleteModal();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search');
  const container = document.getElementById('cards-container');
  const modal = document.getElementById('delete-modal');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterCards((e.target as HTMLInputElement).value);
    });
  }
  
  // Event delegation for delete buttons
  if (container) {
    container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.delete-btn');
      if (btn) {
        const cardId = (btn as HTMLElement).dataset.cardId;
        const cardName = (btn as HTMLElement).dataset.cardName;
        if (cardId && cardName) openDeleteModal(cardId, cardName);
      }
    });
  }
  
  // Modal close handlers
  if (modal) {
    modal.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-cancel')) {
        closeDeleteModal();
      } else if ((e.target as HTMLElement).classList.contains('modal-confirm')) {
        confirmDelete();
      } else if (e.target === modal) {
        closeDeleteModal();
      }
    });
  }
  
  loadCards();
});
