import './card-reader';
import * as db from './db';

async function loadCardForEdit() {
  const params = new URLSearchParams(window.location.search);
  const cardId = params.get('id');
  
  if (!cardId) {
    showError('No card ID provided');
    return;
  }

  try {
    const card = await db.getCardById(cardId);
    
    if (!card) {
      showError('Card not found');
      return;
    }

    // Wait for card-reader element to be defined
    await customElements.whenDefined('card-reader');
    
    // Create card-reader element
    const readerList = document.getElementById('readerList');
    if (!readerList) return;
    
    const reader = document.createElement('card-reader') as any;
    readerList.appendChild(reader);
    
    // Wait for next frame to ensure element is fully connected
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Pre-populate the card reader with existing data
    if (typeof reader.setCardData === 'function') {
      reader.setCardData({
        id: card.id,
        name: card.name,
        manaCost: card.manaCost,
        type: card.type,
        subtype: card.subtype,
        text: card.text,
        flavor: card.flavor,
        power: card.power,
        toughness: card.toughness,
      });
    }
    
    if (typeof reader.setImage === 'function') {
      reader.setImage(card.imageBlob);
    }
    
  } catch (error) {
    console.error('Failed to load card:', error);
    showError('Failed to load card. Please try again.');
  }
}

function showError(message: string) {
  const readerList = document.getElementById('readerList');
  if (!readerList) return;
  
  readerList.innerHTML = `
    <div class="error-message">
      <p>${message}</p>
      <a href="/library/">Return to Library</a>
    </div>
  `;
}

// Initialize
document.addEventListener('DOMContentLoaded', loadCardForEdit);
