import styles from './card-reader.css?inline';
import * as db from './db';

interface ImageSource {
  blob: Blob;
  source: 'upload' | 'camera';
}

interface CardData {
  name: string;
  manaCost: string[];
  type: string;
  subtype: string;
  text: string;
  flavor: string;
  power: number | null;
  toughness: number | null;
  imageUrl?: string;
}

type LanguageModelAPI = any; // TODO: Use @types/dom-chromium-ai when available

let instanceCounter = 0;

export class CardReader extends HTMLElement {
  private root: ShadowRoot;
  private fileInput: HTMLInputElement | null = null;
  private video: HTMLVideoElement | null = null;
  private displayCanvas: HTMLCanvasElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private currentImage: ImageSource | null = null;
  private currentCardData: CardData | null = null;
  private mediaStream: MediaStream | null = null;
  private videoCrop: { sx: number; sy: number; sw: number; sh: number } | null = null;
  private instanceId: string;

  private qs<T extends Element>(selector: string): T | null {
    return this.root.querySelector(selector);
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.instanceId = `card-reader-${++instanceCounter}`;
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  private render() {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styles);
    this.root.adoptedStyleSheets = [styleSheet];

    const container = document.createElement('div');
    container.className = 'card-reader-container';
    container.innerHTML = `
      <div class="header-bar">
        <h2>Card Scanner</h2>
        <button class="close-btn" type="button" style="display: none;" aria-label="Close this reader">×</button>
      </div>
      <div class="content-wrapper">
        <div class="image-section">
        <h3>Add Card Image (optional)</h3>
        <div class="image-options">
          <div class="option">
            <h3>Upload Image</h3>
            <button class="upload-btn" type="button">Choose Image</button>
            <p class="option-description">Upload JPG, PNG, WebP, or Bitmap</p>
          </div>
          <div class="divider">or</div>
          <div class="option">
            <h3>Take Picture</h3>
            <button class="camera-toggle-btn" type="button">Turn On Camera</button>
            <canvas class="camera-canvas" style="display: none;"></canvas>
            <button class="take-photo-btn" type="button" style="display: none;">Take Photo</button>
          </div>
        </div>
        <div class="photo-preview"></div>
        <div class="image-actions">
          <button class="process-btn" type="button">Extract Card Data</button>
          <button class="clear-image-btn" type="button">Clear Image</button>
        </div>
      </div>
      <div class="form-section">
        <h3>Card Details</h3>
        <form class="card-data-form">
          <div class="form-group">
            <label for="${this.instanceId}-name">Card Name</label>
            <input type="text" id="${this.instanceId}-name" class="input-name" value="" required />
          </div>
          <div class="form-group">
            <label for="${this.instanceId}-mana">Mana Cost (comma separated)</label>
            <input type="text" id="${this.instanceId}-mana" class="input-mana" value="" />
          </div>
          <div class="form-group">
            <label for="${this.instanceId}-type">Type</label>
            <input type="text" id="${this.instanceId}-type" class="input-type" value="" />
          </div>
          <div class="form-group">
            <label for="${this.instanceId}-subtype">Subtype</label>
            <input type="text" id="${this.instanceId}-subtype" class="input-subtype" value="" />
          </div>
          <div class="form-group">
            <label for="${this.instanceId}-text">Card Text</label>
            <textarea id="${this.instanceId}-text" class="input-text" rows="4"></textarea>
          </div>
          <div class="form-group">
            <label for="${this.instanceId}-flavor">Flavor Text</label>
            <textarea id="${this.instanceId}-flavor" class="input-flavor flavor-text" rows="3"></textarea>
          </div>
          <div class="form-group form-group-grid">
            <div>
              <label for="${this.instanceId}-power">Power</label>
              <input type="number" id="${this.instanceId}-power" class="input-power" />
            </div>
            <div>
              <label for="${this.instanceId}-toughness">Toughness</label>
              <input type="number" id="${this.instanceId}-toughness" class="input-toughness" />
            </div>
          </div>
          <button type="submit" class="save-btn">Save Card</button>
        </form>
        <div class="form-status" aria-live="polite"></div>
      </div>
      </div>
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/jpeg,image/png,image/webp,image/bmp';
    this.fileInput.style.display = 'none';
    container.appendChild(this.fileInput);

    this.root.appendChild(container);
  }

  private attachEventListeners() {
    this.qs<HTMLButtonElement>('.upload-btn')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e as Event));
    this.qs<HTMLButtonElement>('.camera-toggle-btn')?.addEventListener('click', () => this.toggleCamera());
    this.qs<HTMLButtonElement>('.take-photo-btn')?.addEventListener('click', () => this.capturePhoto());
    this.qs<HTMLButtonElement>('.process-btn')?.addEventListener('click', () => this.processCard());
    this.qs<HTMLButtonElement>('.clear-image-btn')?.addEventListener('click', () => this.clearImage());
    this.qs<HTMLButtonElement>('.close-btn')?.addEventListener('click', () => this.closeReader());
    this.qs<HTMLFormElement>('.card-data-form')?.addEventListener('submit', (e) => this.onSaveCard(e));
    this.updateCloseButtonVisibility();
  }

  private updateCloseButtonVisibility() {
    const closeBtn = this.qs<HTMLButtonElement>('.close-btn');
    if (!closeBtn) return;

    const readerList = document.getElementById('readerList');
    if (!readerList) return;

    const readerCount = readerList.querySelectorAll('card-reader').length;
    closeBtn.style.display = readerCount > 1 ? 'block' : 'none';
  }

  private closeReader() {
    this.stopCamera();
    this.remove();
  }

  private setStatus(message: string, type: 'info' | 'success' | 'error') {
    const status = this.qs<HTMLElement>('.form-status');
    if (!status) return;
    status.textContent = message;
    status.className = `form-status status-${type}`;
  }

  private populateForm(cardData: CardData) {
    const nameInput = this.qs<HTMLInputElement>('.input-name');
    const manaInput = this.qs<HTMLInputElement>('.input-mana');
    const typeInput = this.qs<HTMLInputElement>('.input-type');
    const subtypeInput = this.qs<HTMLInputElement>('.input-subtype');
    const textInput = this.qs<HTMLTextAreaElement>('.input-text');
    const flavorInput = this.qs<HTMLTextAreaElement>('.input-flavor');
    const powerInput = this.qs<HTMLInputElement>('.input-power');
    const toughnessInput = this.qs<HTMLInputElement>('.input-toughness');

    if (nameInput) nameInput.value = cardData.name;
    if (manaInput) manaInput.value = cardData.manaCost.join(', ');
    if (typeInput) typeInput.value = cardData.type;
    if (subtypeInput) subtypeInput.value = cardData.subtype;
    if (textInput) textInput.value = cardData.text;
    if (flavorInput) flavorInput.value = cardData.flavor;
    if (powerInput) powerInput.value = cardData.power !== null ? String(cardData.power) : '';
    if (toughnessInput) toughnessInput.value = cardData.toughness !== null ? String(cardData.toughness) : '';
  }

  private renderPreview(blob: Blob | null) {
    const preview = this.qs<HTMLElement>('.photo-preview');
    if (!preview) return;

    if (!blob) {
      preview.innerHTML = '';
      return;
    }

    const url = URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${url}" alt="Card preview" class="preview-image">`;
  }

  private clearImage() {
    this.currentImage = null;
    this.renderPreview(null);
    const btn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
    const captureBtn = this.qs<HTMLButtonElement>('.take-photo-btn');
    const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');
    if (btn) btn.textContent = 'Turn On Camera';
    if (captureBtn) captureBtn.style.display = 'none';
    if (canvas) canvas.style.display = 'none';
    this.setStatus('', 'info');
  }

  private handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    this.currentImage = { blob: file, source: 'upload' };
    this.renderPreview(file);
  }

  private async toggleCamera() {
    const btn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
    const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');
    const captureBtn = this.qs<HTMLButtonElement>('.take-photo-btn');

    if (this.mediaStream) {
      this.stopCamera();
      if (btn) btn.textContent = 'Turn On Camera';
      if (canvas) canvas.style.display = 'none';
      if (captureBtn) captureBtn.style.display = 'none';
    } else {
      try {
        if (!canvas || !captureBtn || !btn) return;
        await this.startCamera(canvas);
        btn.textContent = 'Turn Off Camera';
        canvas.style.display = 'block';
        captureBtn.style.display = 'block';
      } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera');
      }
    }
  }

  private async startCamera(displayCanvas: HTMLCanvasElement) {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.video = document.createElement('video');
    this.video.srcObject = this.mediaStream;
    this.video.play();

    // Wait for video dimensions
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.video?.videoWidth) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

    // Setup canvases
    displayCanvas.width = 250;
    displayCanvas.height = 350;

    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = this.video.videoWidth;
    this.captureCanvas.height = this.video.videoHeight;

    this.displayCanvas = displayCanvas;

    // Start frame drawing
    const displayCtx = displayCanvas.getContext('2d')!;
    const captureCtx = this.captureCanvas.getContext('2d')!;
    const targetRatio = displayCanvas.width / displayCanvas.height;

    const drawFrame = () => {
      if (!this.mediaStream || !this.video) return;

      const videoRatio = this.video.videoWidth / this.video.videoHeight;
      let sx = 0, sy = 0, sw = this.video.videoWidth, sh = this.video.videoHeight;

      // Crop video to match display canvas aspect ratio
      if (videoRatio > targetRatio) {
        sw = this.video.videoHeight * targetRatio;
        sx = (this.video.videoWidth - sw) / 2;
      } else {
        sh = this.video.videoWidth / targetRatio;
        sy = (this.video.videoHeight - sh) / 2;
      }

      // Store crop for use when capturing photo
      this.videoCrop = { sx, sy, sw, sh };

      displayCtx.drawImage(this.video, sx, sy, sw, sh, 0, 0, displayCanvas.width, displayCanvas.height);
      captureCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight);
      requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  private stopCamera() {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.video?.pause();
    this.video = null;
  }

  private capturePhoto() {
    if (!this.captureCanvas || !this.videoCrop) return;

    const crop = this.videoCrop;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = crop.sw;
    croppedCanvas.height = crop.sh;

    const ctx = croppedCanvas.getContext('2d')!;
    ctx.drawImage(this.video!, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

    croppedCanvas.toBlob((blob) => {
      if (!blob) return;

      this.currentImage = { blob, source: 'camera' };
      this.stopCamera();

      const btn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
      if (btn) btn.textContent = 'Turn On Camera';
      const captureBtn = this.qs<HTMLButtonElement>('.take-photo-btn');
      if (captureBtn) captureBtn.style.display = 'none';
      const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');
      if (canvas) canvas.style.display = 'none';

      this.renderPreview(blob);
    }, 'image/jpeg', 0.95);
  }

  disconnectedCallback() {
    this.stopCamera();
  }

  private async processCard() {
    if (!this.currentImage) {
      this.setStatus('Add an image to extract card data.', 'error');
      return;
    }

    const btn = this.qs<HTMLButtonElement>('.process-btn');
    if (!btn) return;

    btn.disabled = true;
    this.setStatus('Processing image...', 'info');

    try {
      const languageModel = (self as { LanguageModel?: LanguageModelAPI }).LanguageModel;
      if (!languageModel) throw new Error('LanguageModel API not available');

      const session = await languageModel.create({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });

      const cardDataSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          manaCost: { type: 'array', items: { type: 'string' } },
          type: { type: 'string' },
          subtype: { type: 'string' },
          text: { type: 'string' },
          flavor: { type: 'string' },
          power: { type: ['number', 'null'] },
          toughness: { type: ['number', 'null'] },
        },
        required: ['name', 'manaCost', 'type', 'subtype', 'text', 'flavor'],
      };

      const cardResult = await session.prompt(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                value: `Extract all information from this Magic: The Gathering card and return ONLY valid JSON with this schema:
{
  "name": "Card Name",
  "manaCost": ["2", "{U}", "{U}"],
  "type": "Creature",
  "subtype": "Human Wizard",
  "text": "Card abilities text",
  "flavor": "Flavor text",
  "power": 2,
  "toughness": 3
}

Use strings for every mana symbol, including generic mana (e.g., "2") and colored symbols like "{U}", "{W}", "{B}", "{R}", "{G}".
If the card is not a creature, set power and toughness to null.`,
              },
              { type: 'image', value: this.currentImage.blob },
            ],
          },
        ],
        { responseConstraint: cardDataSchema }
      );

      const parsed = typeof cardResult === 'string' ? JSON.parse(cardResult) : cardResult;
      const cardData: CardData = { ...parsed, manaCost: this.normalizeManaCost(parsed.manaCost) };
      this.populateForm(cardData);
      this.setStatus('Extracted data filled in. Review and save.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus(`Error: ${message}`, 'error');
      console.error('Card processing error:', error);
    } finally {
      btn.disabled = false;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private normalizeManaCost(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  private async onSaveCard(e: Event) {
    e.preventDefault();

    try {
      const nameInput = this.qs<HTMLInputElement>('.input-name');
      const manaCostInput = this.qs<HTMLInputElement>('.input-mana');
      const typeInput = this.qs<HTMLInputElement>('.input-type');
      const subtypeInput = this.qs<HTMLInputElement>('.input-subtype');
      const textInput = this.qs<HTMLTextAreaElement>('.input-text');
      const flavorInput = this.qs<HTMLTextAreaElement>('.input-flavor');
      const powerInput = this.qs<HTMLInputElement>('.input-power');
      const toughnessInput = this.qs<HTMLInputElement>('.input-toughness');

      if (!nameInput?.value || !typeInput?.value) {
        this.setStatus('Name and Type are required.', 'error');
        return;
      }

      const manaCost = (manaCostInput?.value || '')
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      const saveData = {
        name: nameInput.value,
        manaCost,
        type: typeInput.value,
        subtype: subtypeInput?.value || '',
        text: textInput?.value || '',
        flavor: flavorInput?.value || '',
        power: powerInput?.value ? parseInt(powerInput.value, 10) : null,
        toughness: toughnessInput?.value ? parseInt(toughnessInput.value, 10) : null,
        imageBlob: this.currentImage?.blob || new Blob(),
        createdAt: Date.now(),
      };

      const cardId = await db.saveCard(saveData);
      this.setStatus(`✓ Card saved! (ID: ${cardId})`, 'success');
      this.dispatchEvent(new CustomEvent('cardSaved', { detail: { id: cardId, name: saveData.name } }));
    } catch (error) {
      console.error('Failed to save card:', error);
      this.setStatus('Failed to save card. Please try again.', 'error');
    }
  }
}

customElements.define('card-reader', CardReader);
